// The Worker-native replacement for the container's Hono app (api/index.ts +
// api/lib/media-routes.ts): auth, oRPC, and every /storage, /upload,
// /download, /video-status, /queue endpoint, backed by the R2 binding
// (r2-storage.ts) and Postgres (video.ts) instead of the container's S3
// client and in-memory job queue. The container now only serves /t/* (the
// actual sharp/ffmpeg transform work) - see worker/index.ts for how requests
// are split between this app and the container.
//
// Shared as-is with the container: better-auth config, oRPC router/context,
// and the bucket lookups - none of it is Node-specific once the DB driver is
// neon-http (see api/db/index.ts).

import { posix as path } from "node:path";
import { RPCHandler } from "@orpc/server/fetch";
import { eq, like } from "drizzle-orm";
import type { Context, Next } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { db } from "../api/db/index.js";
import { user } from "../api/db/schema/auth.js";
import { bucket } from "../api/db/schema/bucket.js";
import { mediaDuration } from "../api/db/schema/media-duration.js";
import { videoJob } from "../api/db/schema/video-job.js";
import { captureEvent } from "../api/lib/analytics.js";
import { deletePerson, findPersonByEmail } from "../api/lib/attio.js";
import { auth } from "../api/lib/auth.js";
import {
  type CustomerData,
  checkFeature,
  deleteCustomer,
  quotaError,
  trackFeature,
} from "../api/lib/autumn.js";
import {
  clearCacheStats,
  deleteBucket,
  getActiveBucketId,
  getBucketOwner,
  getStorageStats,
  listBuckets,
  setStorageStats,
  tenantRootFor,
} from "../api/lib/bucket.js";
import { createContext } from "../api/lib/context.js";
import { forgetContact } from "../api/lib/loops.js";
import { bucketIdOf } from "../api/routers/api-key.js";
import { appRouter } from "../api/routers/index.js";
import { parseAssetRef } from "./asset-ref.js";
import * as r2 from "./r2-storage.js";
import {
  DASHBOARD_THUMB_FORMAT,
  dashboardThumbParams,
  generateCacheKey,
  validateUploadFileType,
} from "./transform-cache.js";
import { signUploadToken, verifyUploadToken } from "./upload-token.js";
import {
  queueEventsStream,
  videoSizeResponse,
  videoStatusResponse,
} from "./video.js";
import { parseDuration } from "./video-duration.js";

const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm"]);
const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "avif",
  "gif",
  "psd",
]);

// A real webp thumbnail is a few to tens of KB - this just caps how
// much unmetered R2 storage a single upload can claim (see worker/app.ts's
// /thumbnail route: it deliberately never calls checkFeature/trackFeature,
// so this is the only guard on that path).
const THUMB_MAX_BLOB_BYTES = 200 * 1024;
// One R2 head per path, so this bounds the whole batch's subrequests.
// Mirrored client-side by apps/web's MISSING_CHECK_BATCH_SIZE.
const THUMBNAILS_MISSING_MAX_PATHS = 100;

// Keeps media_duration's primary key (a raw file path) in sync with a
// video's real path. It's looked up by exact match (checkVideoProcessing,
// meterCompletedVideoJobs), so a rename/move/copy that doesn't update it
// silently drops the video out of both quota gating and billing - not an
// error, just a permanently unmetered file. No-ops harmlessly for non-video
// paths, which never have a row to match.
async function renameMediaDuration(
  oldFullPath: string,
  newFullPath: string,
): Promise<void> {
  await db
    .update(mediaDuration)
    .set({ filePath: newFullPath })
    .where(eq(mediaDuration.filePath, oldFullPath));
}

async function copyMediaDuration(
  oldFullPath: string,
  newFullPath: string,
): Promise<void> {
  const [row] = await db
    .select({ seconds: mediaDuration.seconds })
    .from(mediaDuration)
    .where(eq(mediaDuration.filePath, oldFullPath));
  if (row)
    await db
      .insert(mediaDuration)
      .values({ filePath: newFullPath, seconds: row.seconds });
}

async function renameMediaDurationFolder(
  oldFolderFullPath: string,
  newFolderFullPath: string,
): Promise<void> {
  const rows = await db
    .select({ filePath: mediaDuration.filePath })
    .from(mediaDuration)
    .where(like(mediaDuration.filePath, `${oldFolderFullPath}/%`));
  for (const row of rows) {
    await db
      .update(mediaDuration)
      .set({
        filePath:
          newFolderFullPath + row.filePath.slice(oldFolderFullPath.length),
      })
      .where(eq(mediaDuration.filePath, row.filePath));
  }
}

const BYTES_PER_MB = 1024 * 1024;

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  psd: "image/vnd.adobe.photoshop",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

type Variables = {
  tenantRoot: string;
  userId: string;
  bucketId: string;
  customerData: CustomerData;
};
export const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Auth and oRPC are shared by both dashboards: the customer app on
// CORS_ORIGIN and the admin panel on ADMIN_ORIGIN. Everything below this - the
// media routes - stays pinned to CORS_ORIGIN alone, and the admin panel's own
// R2 routes get their own policy (adminCors).
const dashboardOrigins = [
  process.env.CORS_ORIGIN,
  process.env.ADMIN_ORIGIN,
].filter((origin): origin is string => Boolean(origin));

app.use(
  "/api/*",
  cors({
    origin: dashboardOrigins,
    allowMethods: ["GET", "POST", "OPTIONS"],
    // x-captcha-response carries the Turnstile token on the /api/auth call
    // that mails a sign-in code; a custom header means that call is
    // preflighted, so leaving it out makes it fail at the browser with a bare
    // "Failed to fetch".
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "x-api-key",
      "x-captcha-response",
    ],
    credentials: true,
  }),
);

const mediaCors = cors({
  origin: process.env.CORS_ORIGIN || "",
  allowMethods: ["GET", "POST", "DELETE", "PATCH", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "x-api-key"],
  credentials: true,
});
// POST /upload is the one media route a *customer's* site calls directly
// (@openinary/file-uploader, holding a presigned token - see upload-token.ts),
// so it can't be pinned to CORS_ORIGIN the way the dashboard-only routes are.
// Those uploads carry no cookies and are authorized by the token in the body,
// which makes reflecting their origin harmless. Cookie-bearing requests - the
// dashboard's own uploader - stay pinned, so a third-party page can never ride
// a signed-in user's session to upload on their behalf.
//
// Only the actual POST is discriminated here: a multipart POST with no custom
// headers is a CORS-simple request, so the component never sends a preflight.
const uploadCors = cors({
  origin: (origin, c) =>
    c.req.header("Cookie") ? process.env.CORS_ORIGIN || "" : origin || "*",
  allowMethods: ["POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "x-api-key"],
  credentials: true,
});

app.use("/storage/*", mediaCors);
app.use("/buckets/*", mediaCors);
// Same Hono wildcard caveat as the requireTenant registrations below:
// "/upload/*" would also match "/upload" and run *after* uploadCors, putting
// CORS_ORIGIN back over the reflected origin and breaking every cross-origin
// presigned upload. Enumerate the sub-routes instead.
app.use("/upload", uploadCors);
app.use("/upload/sign", mediaCors);
app.use("/upload/createfolder", mediaCors);
app.use("/download/*", mediaCors);
app.use("/queue/*", mediaCors);
app.use("/video-status/*", mediaCors);

// --- auth + oRPC (unchanged from the container) ---

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

const orpcHandler = new RPCHandler(appRouter);
app.use("/api/rpc/*", async (c, next) => {
  const context = await createContext({ context: c });
  const { matched, response } = await orpcHandler.handle(c.req.raw, {
    prefix: "/api/rpc",
    context,
  });
  if (matched) return c.newResponse(response.body, response);
  await next();
});

app.get("/api", (c) => c.text("OK"));

// --- tenant resolution ---

type TenantCtx = Context<{ Bindings: Env; Variables: Variables }>;

/**
 * An API key may arrive as `x-api-key` (the dashboard's own convention) or as
 * `Authorization: Bearer` - the latter is what @openinary/upload-token's
 * signUpload() sends, and it's the shape a self-hosted instance accepts, so
 * supporting both is what lets one integration target either deployment.
 */
function apiKeyFrom(c: TenantCtx): string | null {
  const header = c.req.header("x-api-key");
  if (header) return header;
  const authorization = c.req.header("Authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearer || null;
}

/**
 * Resolves the caller from either a dashboard session cookie or an API key,
 * and picks the bucket the request operates on. False = unauthenticated.
 *
 * A key created with a bucket scope pins that bucket (its `metadata.bucketId`);
 * an unscoped key - like a session - follows whichever bucket the account has
 * marked active. Note that tenantRoot always embeds the *owner's* userId, so a
 * key can never reach another account's storage even if its metadata were
 * tampered with.
 *
 * The key path deliberately does NOT go through getSession(): better-auth only
 * turns an API key into a session when the plugin's `enableSessionForAPIKeys`
 * is on, and turning that on globally would let a media key act as a full
 * dashboard session on every oRPC procedure too - deleting buckets, minting
 * further keys. verifyApiKey gives us the owner directly, so the key stays
 * scoped to exactly these media routes.
 */
async function applySessionTenant(c: TenantCtx): Promise<boolean> {
  const key = apiKeyFrom(c);
  if (key) {
    const { valid, key: verified } = await auth.api.verifyApiKey({
      body: { key },
    });
    if (!valid || !verified?.referenceId) return false;
    const scoped = (verified.metadata as { bucketId?: unknown } | null)
      ?.bucketId;
    const userId = verified.referenceId;
    const bucketId =
      typeof scoped === "string" ? scoped : await getActiveBucketId(userId);
    c.set("tenantRoot", tenantRootFor(userId, bucketId));
    c.set("bucketId", bucketId);
    c.set("userId", userId);
    // No name/email on a key-authenticated request: the account is long since
    // created in Autumn by the time it can mint keys, and CustomerData's
    // fields are optional precisely for this case.
    c.set("customerData", {});
    return true;
  }

  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return false;

  const bucketId = await getActiveBucketId(session.user.id);
  c.set("tenantRoot", tenantRootFor(session.user.id, bucketId));
  c.set("bucketId", bucketId);
  c.set("userId", session.user.id);
  c.set("customerData", { name: session.user.name, email: session.user.email });
  return true;
}

async function requireTenant(c: TenantCtx, next: Next) {
  if (!(await applySessionTenant(c)))
    return c.json({ error: "Unauthorized" }, 401);
  await next();
}

app.use("/storage/*", requireTenant);
// Listed one by one rather than as "/upload/*": in Hono that wildcard also
// matches the bare "/upload", which would 401 every presigned upload before
// the handler ever sees its token. POST /upload deliberately has no tenant
// middleware - it accepts either a session or a presigned token, and the
// token is only readable once the multipart body is parsed, so it
// authenticates inside the handler. These two are session/API-key only.
app.use("/upload/sign", requireTenant);
app.use("/upload/createfolder", requireTenant);
app.use("/download/*", requireTenant);
app.use("/video-status/*", requireTenant);

// --- buckets ---

/**
 * Destroys one bucket and everything under it. Deliberately outside
 * "/storage/*" so it never picks up requireTenant: that middleware also
 * accepts API keys, and a media key must never be able to delete a bucket
 * (same reasoning as the getSession note in applySessionTenant). It also
 * resolves the *active* bucket, while the target here comes from the path.
 *
 * Not an oRPC procedure like the rest of bucket CRUD because the sweep needs
 * the R2/KV bindings, and api/ is a separate TS program from worker/ (see the
 * two tsconfigs) with no @cloudflare/workers-types.
 *
 * ponytail: lists and deletes in pages of 1000, so a Worker's
 * 1000-subrequest budget covers roughly 500k objects per bucket - move to a
 * Queue if a tenant ever outgrows that.
 */
app.delete("/buckets/:bucketId", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return c.json({ error: "Unauthorized" }, 401);
  const userId = session.user.id;
  const bucketId = c.req.param("bucketId");

  const buckets = await listBuckets(userId);
  if (!buckets.some((b) => b.id === bucketId))
    return c.json({ error: "Not found", message: "Bucket not found" }, 404);
  if (buckets.length === 1)
    return c.json(
      { error: "Bad request", message: "You can't delete your only bucket" },
      400,
    );

  const tenantRoot = tenantRootFor(userId, bucketId);
  try {
    // R2 before Postgres: a half-failed sweep leaves an emptied bucket the
    // user can just delete again, whereas dropping the row first orphans
    // every object - nothing else maps a tenantRoot back to an account.
    const { bytes } = await r2.deleteFolder(c.env.MEDIA_BUCKET, tenantRoot, "");
    await r2.deleteCacheForTenant(c.env.MEDIA_BUCKET, tenantRoot);
    await db
      .delete(mediaDuration)
      .where(like(mediaDuration.filePath, `${tenantRoot}/%`));
    await db.delete(videoJob).where(like(videoJob.filePath, `${tenantRoot}/%`));

    // Keys pinned to this bucket would otherwise keep authenticating while
    // writing into a prefix nothing can read back.
    const { apiKeys } = await auth.api.listApiKeys({
      headers: c.req.raw.headers,
    });
    for (const key of apiKeys) {
      if (bucketIdOf(key.metadata) === bucketId)
        await auth.api.deleteApiKey({
          headers: c.req.raw.headers,
          body: { keyId: key.id },
        });
    }

    await deleteBucket(userId, bucketId);
    c.executionCtx.waitUntil(
      Promise.all([
        // The owner cache has no TTL (see resolveBucketOwner in index.ts).
        c.env.BUCKET_OWNERS.delete(bucketId),
        trackFeature(userId, "storage_mb", -Math.round(bytes / BYTES_PER_MB), {
          name: session.user.name,
          email: session.user.email,
        }),
      ]),
    );
    return c.body(null, 204);
  } catch (error) {
    console.error("Failed to delete bucket", error);
    return c.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// --- admin ---

// The admin panel's two destructive routes. They live here rather than in the
// oRPC router for the same reason DELETE /buckets/:bucketId does: both sweep
// R2, and api/ compiles without @cloudflare/workers-types. Everything the
// admin panel can do that *doesn't* need a binding is in
// api/routers/admin.ts.
//
// Pinned to ADMIN_ORIGIN alone - the customer app has no business preflighting
// these, and reflecting its origin here would be the only thing between a
// signed-in customer's browser and a delete-account call.
app.use(
  "/admin/*",
  cors({
    origin: process.env.ADMIN_ORIGIN || "",
    allowMethods: ["GET", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    credentials: true,
  }),
);

/**
 * Same gate as adminProcedure (api/lib/orpc.ts), off the same env var. Not
 * requireTenant: that also accepts API keys, and no media key may ever reach
 * an admin route - the same reasoning as the bucket-delete route above.
 */
async function requireAdmin(c: TenantCtx, next: Next) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  // 401 and 403 are told apart on purpose: apps/admin's middleware sends the
  // first to the dashboard to sign in and hard-refuses the second, so a
  // customer who wanders onto the admin host is never bounced through a
  // sign-in flow that could not possibly help them.
  if (!session?.user) return c.json({ error: "Unauthorized" }, 401);

  const adminUserId = process.env.ADMIN_USER_ID;
  if (!adminUserId || session.user.id !== adminUserId) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
}
app.use("/admin/*", requireAdmin);

/**
 * Is the caller the administrator? The answer is the status code - 204, 401 or
 * 403, all three produced by requireAdmin above before this handler is ever
 * reached.
 *
 * Exists so apps/admin can decide whether to serve a page at all, without
 * holding its own copy of ADMIN_USER_ID. That copy is the whole point: a
 * second source of truth for who the admin is drifts, and the drift is silent
 * (an id that is stale in one file locks the real admin out, or worse).
 */
app.get("/admin/check", (c) => c.body(null, 204));

/**
 * DELETE /admin/asset { ref } - legal takedown. `ref` is whatever the
 * complaint quoted: a full CDN URL, a "/b/..." path, or "{bucketId}/file".
 *
 * The owner is resolved from the bucket rather than supplied, so a takedown
 * can't be aimed at a path under someone else's tenant root by hand-editing
 * the reference.
 */
app.delete("/admin/asset", async (c) => {
  const { ref } = await c.req.json<{ ref?: string }>();
  const parsed = ref ? parseAssetRef(ref) : null;
  if (!parsed)
    return c.json(
      { error: "Bad request", message: "Could not read an asset path" },
      400,
    );

  const userId = await getBucketOwner(parsed.bucketId);
  if (!userId)
    return c.json({ error: "Not found", message: "Unknown bucket" }, 404);

  try {
    const deleted = await deleteOneAsset(
      c.env.MEDIA_BUCKET,
      tenantRootFor(userId, parsed.bucketId),
      userId,
      parsed.filePath,
      {},
    );
    if (!deleted)
      return c.json({ error: "Not found", message: "File not found" }, 404);
    return c.json({ success: true, userId, ...parsed, ...deleted });
  } catch (error) {
    console.error("Failed to take down asset", error);
    return c.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

/**
 * DELETE /admin/users/:userId - erases the account from every system it exists
 * in: R2, Postgres, the KV owner cache, its UsageMeter instance, Autumn (and
 * Stripe), Attio, and Loops.
 *
 * The order matters and mirrors DELETE /buckets/:bucketId: R2 before Postgres,
 * because nothing but a `bucket` row maps a tenant root back to an account -
 * dropping the rows first would orphan every object permanently, while a
 * half-finished sweep just leaves an account that can be deleted again.
 *
 * removeUser is last for the same reason, and takes `session`, `account` and
 * `apikey` with it through their foreign keys.
 */
app.delete("/admin/users/:userId", async (c) => {
  const userId = c.req.param("userId");
  if (userId === process.env.ADMIN_USER_ID)
    return c.json(
      { error: "Bad request", message: "You can't delete your own account" },
      400,
    );

  const account = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId));
  if (account.length === 0)
    return c.json({ error: "Not found", message: "User not found" }, 404);

  try {
    const buckets = await listBuckets(userId);
    for (const { id } of buckets) {
      const tenantRoot = tenantRootFor(userId, id);
      await r2.deleteFolder(c.env.MEDIA_BUCKET, tenantRoot, "");
      await r2.deleteCacheForTenant(c.env.MEDIA_BUCKET, tenantRoot);
    }

    // One prefix covers every bucket - both tables are keyed by the full
    // "ugc/{userId}/{bucketId}/..." path.
    const userRoot = `ugc/${userId}/`;
    await db
      .delete(mediaDuration)
      .where(like(mediaDuration.filePath, `${userRoot}%`));
    await db.delete(videoJob).where(like(videoJob.filePath, `${userRoot}%`));

    await Promise.all(buckets.map(({ id }) => c.env.BUCKET_OWNERS.delete(id)));
    await c.env.USAGE_METER.get(c.env.USAGE_METER.idFromName(userId)).wipe();
    await db.delete(bucket).where(eq(bucket.userId, userId));

    // Third parties last among the fallible steps: each logs and continues, so
    // a CRM outage can't leave the account half-deleted in our own systems.
    await deleteCustomer(userId).catch((error) =>
      console.error(`Failed to delete Autumn customer ${userId}`, error),
    );
    const person = await findPersonByEmail(account[0].email).catch(() => null);
    if (person)
      await deletePerson(person.recordId).catch((error) =>
        console.error(`Failed to delete Attio record for ${userId}`, error),
      );
    // Deleting the contact is also what pulls them out of any lifecycle
    // sequence they are part-way through - see forgetContact. Skipped and the
    // account goes on being emailed for weeks after it stopped existing.
    await forgetContact(userId);

    await auth.api.removeUser({
      headers: c.req.raw.headers,
      body: { userId },
    });
    return c.body(null, 204);
  } catch (error) {
    console.error("Failed to delete account", error);
    return c.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// --- storage ---

// GET /storage?path= - one directory level. Must stay before folder-suffixed
// routes below aren't affected (this is the exact "/storage" root, not "/*"),
// but registration order still mirrors core's storage.js for anything that
// could otherwise shadow it.
app.get("/storage", async (c) => {
  const levelPath = r2.normalizeLevelPath(c.req.query("path") ?? "");
  if (levelPath === null)
    return c.json({ error: "Bad request", message: "Invalid path" }, 400);
  try {
    const { folderNames, files } = await r2.listLevel(
      c.env.MEDIA_BUCKET,
      c.get("tenantRoot"),
      levelPath,
    );
    const folders = folderNames.map((name) => ({
      name,
      path: levelPath ? `${levelPath}/${name}` : name,
    }));
    return c.json({ path: levelPath, folders, files });
  } catch (error) {
    console.error("Failed to list storage contents", error);
    return c.json({ error: "Failed to list storage contents" }, 500);
  }
});

// Registered before the generic "/storage/*" routes below - same reason
// core's storage.js gives: these are fixed sub-paths, not filePath segments.
const FOLDER_SUMMARIES_MAX_PATHS = 200;
app.get("/storage/folder-summaries", async (c) => {
  const raw = c.req.query("paths") ?? "";
  const requested = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (requested.length === 0) return c.json({ summaries: {} });
  if (requested.length > FOLDER_SUMMARIES_MAX_PATHS) {
    return c.json(
      {
        error: "Bad request",
        message: `Too many paths (max ${FOLDER_SUMMARIES_MAX_PATHS})`,
      },
      400,
    );
  }
  const paths: string[] = [];
  for (const p of requested) {
    const normalized = r2.normalizeLevelPath(p);
    if (normalized === null)
      return c.json({ error: "Bad request", message: "Invalid path" }, 400);
    paths.push(normalized);
  }
  try {
    const tenantRoot = c.get("tenantRoot");
    const summaries: Record<string, r2.FolderSummary> = {};
    const batchSize = 16;
    for (let i = 0; i < paths.length; i += batchSize) {
      const batch = paths.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(
          async (folderPath) =>
            [
              folderPath,
              await r2.folderSummary(
                c.env.MEDIA_BUCKET,
                tenantRoot,
                folderPath,
              ),
            ] as const,
        ),
      );
      for (const [folderPath, summary] of results)
        summaries[folderPath] = summary;
    }
    return c.json({ summaries });
  } catch (error) {
    console.error("Failed to get folder summaries", error);
    return c.json({ error: "Failed to get folder summaries" }, 500);
  }
});

// The one cache key every dashboard preview of this asset resolves to,
// whichever of @openinary/ui's four sizes asked for it - see
// dashboardThumbParams.
function thumbnailCacheKey(fullPath: string, isImage: boolean): string {
  return generateCacheKey(fullPath, dashboardThumbParams(isImage));
}

// GET /storage/thumbnails-missing?paths=a,b,c - batched check backing the
// dashboard's client-side thumbnail generator (apps/web/src/lib/thumbnails):
// for each image/video path, is the key its dashboard previews ask for
// already sitting in the transform cache? Nothing else would ever backfill
// it now that the container no longer serves these.
app.get("/storage/thumbnails-missing", async (c) => {
  const raw = c.req.query("paths") ?? "";
  const requested = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (requested.length === 0) return c.json({ missing: [] });
  if (requested.length > THUMBNAILS_MISSING_MAX_PATHS) {
    return c.json(
      {
        error: "Bad request",
        message: `Too many paths (max ${THUMBNAILS_MISSING_MAX_PATHS})`,
      },
      400,
    );
  }
  const bucket = c.env.MEDIA_BUCKET;
  const tenantRoot = c.get("tenantRoot");
  try {
    const results = await Promise.all(
      requested.map(async (filePath) => {
        const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
        const isImage = IMAGE_EXTENSIONS.has(ext);
        if (!isImage && !VIDEO_EXTENSIONS.has(ext)) return null;
        const head = await bucket.head(
          thumbnailCacheKey(`${tenantRoot}/${filePath}`, isImage),
        );
        return head ? null : filePath;
      }),
    );
    return c.json({ missing: results.filter((p): p is string => p !== null) });
  } catch (error) {
    console.error("Failed to check missing thumbnails", error);
    return c.json({ error: "Failed to check missing thumbnails" }, 500);
  }
});

// Scoped to the caller's active bucket (tenantRoot/bucketId from
// requireTenant) - see schema/bucket.ts for why /storage/stats reads a
// cached snapshot instead of live-scanning R2 on every request.
app.get("/storage/stats", async (c) => {
  try {
    return c.json(await getStorageStats(c.get("bucketId")));
  } catch (error) {
    console.error("Failed to get storage stats", error);
    return c.json({ error: "Failed to get storage stats" }, 500);
  }
});

app.post("/storage/stats/recalculate", async (c) => {
  const tenantRoot = c.get("tenantRoot");
  try {
    const originals = (
      await r2.listAll(c.env.MEDIA_BUCKET, `public/${tenantRoot}/`)
    ).filter((o) => !o.key.endsWith("/"));
    const cacheObjects = await r2.listCacheForTenant(
      c.env.MEDIA_BUCKET,
      tenantRoot,
    );
    const stats = {
      storage: {
        size: originals.reduce((sum, o) => sum + o.size, 0),
        fileCount: originals.length,
      },
      cache: {
        size: cacheObjects.reduce((sum, o) => sum + o.size, 0),
        fileCount: cacheObjects.length,
      },
    };
    const updatedAt = await setStorageStats(c.get("bucketId"), stats);
    return c.json({ ...stats, updatedAt });
  } catch (error) {
    console.error("Failed to recalculate storage stats", error);
    return c.json({ error: "Failed to recalculate storage stats" }, 500);
  }
});

app.post("/storage/cache/clear", async (c) => {
  try {
    await r2.deleteCacheForTenant(c.env.MEDIA_BUCKET, c.get("tenantRoot"));
    await clearCacheStats(c.get("bucketId"));
    return c.body(null, 204);
  } catch (error) {
    console.error("Failed to clear cache", error);
    return c.json({ error: "Failed to clear cache" }, 500);
  }
});

app.get("/storage/folders", async (c) => {
  try {
    const tenantRoot = c.get("tenantRoot");
    const objects = await r2.listAll(
      c.env.MEDIA_BUCKET,
      `public/${tenantRoot}/`,
    );
    return c.json({ folders: r2.deriveFolderPaths(objects, tenantRoot) });
  } catch (error) {
    console.error("Failed to list storage folders", error);
    return c.json({ error: "Failed to list storage folders" }, 500);
  }
});

function extractFilePath(requestPath: string, suffix?: RegExp): string {
  let pathWithoutPrefix = requestPath.replace(/^\/storage\/?/, "");
  if (suffix) pathWithoutPrefix = pathWithoutPrefix.replace(suffix, "");
  let filePath = pathWithoutPrefix.replace(/^\/+/, "").replace(/\/+$/, "");
  try {
    filePath = decodeURIComponent(filePath);
  } catch {
    // Keep the original (undecoded) path on a malformed escape sequence.
  }
  return filePath;
}

// GET /storage/{path}/metadata
app.get("/storage/*", async (c) => {
  const requestPath = new URL(c.req.url).pathname;
  if (!requestPath.endsWith("/metadata")) return c.notFound();
  const filePath = extractFilePath(requestPath, /\/metadata$/);
  if (!filePath)
    return c.json(
      { error: "Bad request", message: "File path is required" },
      400,
    );
  try {
    const metadata = await r2.getOriginalMetadata(
      c.env.MEDIA_BUCKET,
      c.get("tenantRoot"),
      filePath,
    );
    if (!metadata)
      return c.json({ error: "Not found", message: "File not found" }, 404);
    return c.json(metadata);
  } catch (error) {
    console.error("Failed to get file metadata", error);
    return c.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

/**
 * Removes one file and everything derived from it: cached transforms, video
 * jobs, cached duration - and credits the freed storage back.
 *
 * Shared by the customer's own DELETE /storage/* below and by the admin
 * takedown route (DELETE /admin/asset), which reaches a file it does not own.
 * One function so a legal takedown can't quietly leave behind a derivative the
 * customer's own delete would have swept.
 *
 * Returns null when there is no such file, so callers can tell that apart from
 * a delete that happened.
 */
async function deleteOneAsset(
  bucket: R2Bucket,
  tenantRoot: string,
  userId: string,
  filePath: string,
  customerData: CustomerData,
): Promise<{ jobsDeleted: number; cloudCacheFilesDeleted: number } | null> {
  const fileMeta = await r2.getOriginalMetadata(bucket, tenantRoot, filePath);
  if (!fileMeta) return null;

  const fullPath = `${tenantRoot}/${filePath}`;
  const jobsToDelete = await db
    .select({ id: videoJob.id })
    .from(videoJob)
    .where(eq(videoJob.filePath, fullPath));
  if (jobsToDelete.length > 0)
    await db.delete(videoJob).where(eq(videoJob.filePath, fullPath));
  const cloudCacheFilesDeleted = await r2.deleteCachedTransformations(
    bucket,
    fullPath,
  );
  await r2.deleteOriginal(bucket, tenantRoot, filePath);
  await db.delete(mediaDuration).where(eq(mediaDuration.filePath, fullPath));
  await trackFeature(
    userId,
    "storage_mb",
    -Math.round(fileMeta.size / BYTES_PER_MB),
    customerData,
  );
  return { jobsDeleted: jobsToDelete.length, cloudCacheFilesDeleted };
}

/**
 * Drops the cached derivatives an asset had under the path it just moved away
 * from - one call covers a file or a whole renamed folder.
 *
 * Nothing serves those objects after the move (the cache key hashes the full
 * path, so the new path misses and regenerates), but nothing collected them
 * either: they kept the *old* path in "x-original-path", which is what both
 * this sweep and the /storage/stats recalculation match on. Left alone they
 * accumulate for good, and dashboard thumbnails make that certain rather than
 * theoretical - /storage/thumbnails-missing reports the new path as missing,
 * the client re-uploads, and every rename strands one more thumbnail.
 *
 * Deliberately not awaited. It is garbage collection for a rename that already
 * succeeded, so it must neither add a full cache scan to the response time nor
 * turn a completed move into a 500.
 */
function purgeRenamedCache(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  oldFullPath: string,
): void {
  c.executionCtx.waitUntil(
    r2
      .deleteCachedTransformations(c.env.MEDIA_BUCKET, oldFullPath)
      .catch((error) =>
        console.error("Failed to purge cache after rename", error),
      ),
  );
}

// DELETE /storage/* - file (+ its cached transforms + video jobs) or a whole
// folder, recursively.
app.delete("/storage/*", async (c) => {
  const requestPath = new URL(c.req.url).pathname;
  const filePath = extractFilePath(requestPath);
  if (!filePath)
    return c.json(
      { error: "Bad request", message: "File path is required" },
      400,
    );
  const bucket = c.env.MEDIA_BUCKET;
  const tenantRoot = c.get("tenantRoot");
  const userId = c.get("userId");
  const customerData = c.get("customerData");
  try {
    // File first: null means no such object, which is the only case where the
    // path might name a folder instead.
    const deleted = await deleteOneAsset(
      bucket,
      tenantRoot,
      userId,
      filePath,
      customerData,
    );
    if (deleted) {
      return c.json({
        success: true,
        message: "Asset deleted successfully",
        details: { ...deleted, localCacheFilesDeleted: 0 },
      });
    }

    const isFolder = await r2.folderExists(bucket, tenantRoot, filePath);
    if (!isFolder)
      return c.json({ error: "Not found", message: "File not found" }, 404);
    const { bytes } = await r2.deleteFolder(bucket, tenantRoot, filePath);
    const folderFullPath = `${tenantRoot}/${filePath}`;
    await db
      .delete(mediaDuration)
      .where(like(mediaDuration.filePath, `${folderFullPath}/%`));
    c.executionCtx.waitUntil(
      trackFeature(
        userId,
        "storage_mb",
        -Math.round(bytes / BYTES_PER_MB),
        customerData,
      ),
    );
    // Mirrors core's deleteAssetCompletely: the folder branch returns
    // without touching job/cache counters, so these stay zeroed.
    return c.json({
      success: true,
      message: "Asset deleted successfully",
      details: {
        jobsDeleted: 0,
        localCacheFilesDeleted: 0,
        cloudCacheFilesDeleted: 0,
      },
    });
  } catch (error) {
    console.error("Failed to delete asset", error);
    return c.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// PATCH /storage/* { name } - rename in place.
app.patch("/storage/*", async (c) => {
  const requestPath = new URL(c.req.url).pathname;
  const filePath = extractFilePath(requestPath);
  if (!filePath)
    return c.json(
      { error: "Bad request", message: "File path is required" },
      400,
    );
  let body: { name?: unknown } = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Bad request", message: "Invalid JSON body" }, 400);
  }
  const newName =
    typeof body.name === "string"
      ? r2.stripUrlHostile(body.name.trim()).normalize("NFC")
      : "";
  if (!newName || newName.includes("/") || newName.includes("\\")) {
    return c.json(
      { error: "Bad request", message: "A valid name is required" },
      400,
    );
  }
  const dir = path.dirname(filePath);
  const newPath = dir === "." ? newName : `${dir}/${newName}`;
  const bucket = c.env.MEDIA_BUCKET;
  const tenantRoot = c.get("tenantRoot");
  try {
    const isFile = await r2.existsOriginal(bucket, tenantRoot, filePath);
    const isFolder =
      !isFile && (await r2.folderExists(bucket, tenantRoot, filePath));
    if (!isFile && !isFolder)
      return c.json(
        { error: "Not found", message: "File or folder not found" },
        404,
      );
    if (newPath !== filePath) {
      const targetIsFile = await r2.existsOriginal(bucket, tenantRoot, newPath);
      const targetIsFolder =
        !targetIsFile && (await r2.folderExists(bucket, tenantRoot, newPath));
      if (targetIsFile || targetIsFolder) {
        return c.json(
          {
            error: "Conflict",
            message: "A file or folder with that name already exists",
          },
          409,
        );
      }
    }
    if (isFolder) {
      await r2.renameFolder(bucket, tenantRoot, filePath, newPath);
      await renameMediaDurationFolder(
        `${tenantRoot}/${filePath}`,
        `${tenantRoot}/${newPath}`,
      );
    } else {
      await r2.renameOriginal(bucket, tenantRoot, filePath, newPath);
      await renameMediaDuration(
        `${tenantRoot}/${filePath}`,
        `${tenantRoot}/${newPath}`,
      );
    }
    purgeRenamedCache(c, `${tenantRoot}/${filePath}`);
    return c.json({ success: true, path: newPath });
  } catch (error) {
    console.error("Failed to rename asset", error);
    return c.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// POST /storage/*/thumbnail { thumb } - client-side-generated dashboard
// thumbnail (see apps/web/src/lib/thumbnails). Writes straight into the
// transform cache under the key tryServeFromR2Cache (worker/index.ts) looks
// up for this asset, so every dashboard view of it is a cache hit - which is
// the only way it renders at all now, since that function 404s dashboard
// segments rather than falling through to the container.
// Deliberately never calls checkFeature/trackFeature - this cost is
// absorbed by us, not metered against the account's
// image_transformations/storage_mb quota.
async function handleThumbnailUpload(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  requestPath: string,
): Promise<Response> {
  const filePath = extractFilePath(requestPath, /\/thumbnail$/);
  if (!filePath)
    return c.json(
      { error: "Bad request", message: "File path is required" },
      400,
    );
  const bucket = c.env.MEDIA_BUCKET;
  const tenantRoot = c.get("tenantRoot");
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const isImage = IMAGE_EXTENSIONS.has(ext);
  const isVideo = VIDEO_EXTENSIONS.has(ext);
  if (!isImage && !isVideo)
    return c.json(
      { error: "Bad request", message: "Unsupported file type" },
      400,
    );
  try {
    if (!(await r2.existsOriginal(bucket, tenantRoot, filePath))) {
      return c.json({ error: "Not found", message: "File not found" }, 404);
    }
    const formData = await c.req.formData();
    const fullPath = `${tenantRoot}/${filePath}`;
    const blob = formData.get("thumb");
    if (!(blob instanceof File)) {
      return c.json(
        { error: "Bad request", message: 'Missing "thumb" thumbnail' },
        400,
      );
    }
    if (blob.size === 0 || blob.size > THUMB_MAX_BLOB_BYTES) {
      return c.json(
        {
          error: "Bad request",
          message: `Thumbnail must be under ${THUMB_MAX_BLOB_BYTES} bytes`,
        },
        400,
      );
    }
    await bucket.put(
      thumbnailCacheKey(fullPath, isImage),
      await blob.arrayBuffer(),
      {
        httpMetadata: { contentType: `image/${DASHBOARD_THUMB_FORMAT}` },
        customMetadata: { "x-original-path": encodeURIComponent(fullPath) },
      },
    );
    return c.json({ success: true });
  } catch (error) {
    console.error("Failed to store thumbnail", error);
    return c.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
}

// POST /storage/*/copy, /storage/*/move { destination? }, and
// /storage/*/thumbnail - kept as endsWith branches on one wildcard route
// rather than separate route registrations, matching every other
// /storage/* handler in this file (Hono's "*" only matches at the end of a
// pattern, so "/storage/*/thumbnail" wouldn't reliably match a nested path).
app.post("/storage/*", async (c) => {
  const requestPath = new URL(c.req.url).pathname;
  if (requestPath.endsWith("/thumbnail"))
    return handleThumbnailUpload(c, requestPath);
  const isCopy = requestPath.endsWith("/copy");
  const isMove = requestPath.endsWith("/move");
  if (!isCopy && !isMove) return c.notFound();
  const filePath = extractFilePath(requestPath, /\/(copy|move)$/);
  if (!filePath)
    return c.json(
      { error: "Bad request", message: "File path is required" },
      400,
    );
  const bucket = c.env.MEDIA_BUCKET;
  const tenantRoot = c.get("tenantRoot");
  try {
    const isFile = await r2.existsOriginal(bucket, tenantRoot, filePath);
    const isFolder =
      !isFile &&
      isMove &&
      (await r2.folderExists(bucket, tenantRoot, filePath));
    if (!isFile && !isFolder)
      return c.json({ error: "Not found", message: "File not found" }, 404);

    const dir = path.dirname(filePath);
    const normalizedDir = dir === "." ? "" : dir;
    // Stripped even though it comes from a key that already exists: a copy
    // writes a brand-new key, so without this one hostile name reproduces
    // itself indefinitely. A move heals the name instead of carrying the
    // breakage across, which only ever renames a file that was unreachable
    // anyway.
    const baseName = r2.stripUrlHostile(path.basename(filePath));
    let targetDir = normalizedDir;

    if (isMove) {
      let body: { destination?: unknown } = {};
      try {
        body = await c.req.json();
      } catch {
        // No body means move to root.
      }
      targetDir =
        typeof body.destination === "string"
          ? r2
              .stripUrlHostile(body.destination.trim())
              .replace(/^\/+|\/+$/g, "")
              .normalize("NFC")
          : "";
      if (targetDir === normalizedDir)
        return c.json(
          { error: "Bad request", message: "File is already in that folder" },
          400,
        );
    }

    if (isFolder) {
      const newPath = targetDir ? `${targetDir}/${baseName}` : baseName;
      await r2.renameFolder(bucket, tenantRoot, filePath, newPath);
      await renameMediaDurationFolder(
        `${tenantRoot}/${filePath}`,
        `${tenantRoot}/${newPath}`,
      );
      purgeRenamedCache(c, `${tenantRoot}/${filePath}`);
      return c.json({ success: true, path: newPath });
    }

    let candidatePath: string;
    if (isCopy) {
      const ext = path.extname(baseName);
      const nameWithoutExt = ext ? baseName.slice(0, -ext.length) : baseName;
      const copyName = `${nameWithoutExt} copy${ext}`;
      candidatePath = targetDir ? `${targetDir}/${copyName}` : copyName;
    } else {
      candidatePath = targetDir ? `${targetDir}/${baseName}` : baseName;
    }
    const newPath = await r2.getUniqueFilePath(candidatePath, (candidate) =>
      r2.existsOriginal(bucket, tenantRoot, candidate),
    );
    if (isCopy) {
      await r2.copyOriginal(bucket, tenantRoot, filePath, newPath);
      await copyMediaDuration(
        `${tenantRoot}/${filePath}`,
        `${tenantRoot}/${newPath}`,
      );
    } else {
      await r2.renameOriginal(bucket, tenantRoot, filePath, newPath);
      await renameMediaDuration(
        `${tenantRoot}/${filePath}`,
        `${tenantRoot}/${newPath}`,
      );
      // Move only. A copy leaves the source where it is, so its derivatives
      // are still live and purging them would evict a cache nobody invalidated.
      purgeRenamedCache(c, `${tenantRoot}/${filePath}`);
    }
    return c.json({ success: true, path: newPath });
  } catch (error) {
    console.error(`Failed to ${isCopy ? "copy" : "move"} asset`, error);
    return c.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// --- upload ---

/**
 * Mints a presigned upload token for @openinary/file-uploader. Called by the
 * customer's *backend* with its API key (requireTenant covers /upload/*), never
 * from a browser - that's the whole point: the API key stays server-side and
 * only this short-lived, tenant-scoped token reaches the page.
 */
const SIGN_MAX_EXPIRES_IN = 3600;
const SIGN_DEFAULT_EXPIRES_IN = 300;
app.post("/upload/sign", async (c) => {
  const body = await c.req
    .json<{ folder?: unknown; expiresIn?: unknown }>()
    .catch(() => ({}) as Record<string, never>);
  const rawFolder = typeof body.folder === "string" ? body.folder : "";
  const folder = rawFolder
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .normalize("NFC");
  if (folder.split("/").some((s) => s === "." || s === "..")) {
    return c.json({ success: false, error: "Invalid folder" }, 400);
  }
  const requested =
    typeof body.expiresIn === "number" && Number.isFinite(body.expiresIn)
      ? body.expiresIn
      : SIGN_DEFAULT_EXPIRES_IN;
  const expiresIn = Math.min(
    Math.max(Math.floor(requested), 1),
    SIGN_MAX_EXPIRES_IN,
  );
  const expires = Math.floor(Date.now() / 1000) + expiresIn;
  const signature = signUploadToken({
    userId: c.get("userId"),
    bucketId: c.get("bucketId"),
    folder,
    expires,
  });
  // `success` isn't decoration: signUpload() treats a 200 without it as a
  // failure and throws.
  return c.json({ success: true, signature, expires, folder });
});

app.post("/upload", async (c) => {
  const formData = await c.req.formData();

  // Two ways in. A presigned token names its own tenant *and* folder, so
  // neither is read from the request - a token minted for one bucket/folder
  // can't be replayed against another by editing the form fields.
  const signature = formData.get("signature");
  const token =
    typeof signature === "string" ? verifyUploadToken(signature) : null;
  if (token) {
    c.set("tenantRoot", tenantRootFor(token.userId, token.bucketId));
    c.set("bucketId", token.bucketId);
    c.set("userId", token.userId);
    // Quota calls want a name/email for customer auto-creation in Autumn; the
    // account already exists by the time it can mint tokens, so the id alone
    // is enough to attribute usage.
    c.set("customerData", {});
    // The Get started checklist's "your app uploaded" signal. Only reachable
    // on this branch: the session path below is the dashboard's own uploader,
    // which proves nothing about an integration. Off the response path, and a
    // failure here costs a checkbox, never the upload.
    c.executionCtx.waitUntil(
      c.env.USAGE_METER.get(c.env.USAGE_METER.idFromName(token.userId))
        .markApiUpload()
        .catch((error) =>
          console.error(`Failed to mark API upload for ${token.userId}`, error),
        ),
    );
  } else if (typeof signature === "string") {
    // Distinguish "bad/expired token" from "no token at all" - the component
    // retries after re-signing, and a generic 401 gives it nothing to act on.
    return c.json(
      { success: false, error: "Invalid or expired upload signature" },
      401,
    );
  } else if (!(await applySessionTenant(c))) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  const folder = token ? token.folder : formData.get("folder");
  // NFC-normalize: macOS hands the browser NFD-decomposed accented
  // filenames (e.g. dropped from Finder), while every reader of this path
  // (dashboard listing, CDN URLs typed/pasted by a browser) works in NFC -
  // storing the raw NFD form here means the R2 key never matches what a
  // later request looks up, a permanent 404 that isn't a caching artifact.
  const destFolder =
    typeof folder === "string"
      ? r2
          .stripUrlHostile(folder.trim())
          .replace(/^\/+|\/+$/g, "")
          .normalize("NFC")
      : "";
  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File);
  if (files.length === 0)
    return c.json({ success: false, error: "No files uploaded" }, 400);
  // Core's upload whitelist (vendored in transform-cache.ts, pinned to the
  // real package by transform-cache.test.ts): rejects svg (stored-XSS
  // vector when served inline) and anything the transform pipeline can't
  // decode. The "application/octet-stream" fallback mirrors what
  // uploadOriginal stores below - it's also how browsers hand over
  // extension-only types like .psd.
  for (const file of files) {
    if (
      !validateUploadFileType(
        file.name,
        file.type || "application/octet-stream",
      )
    ) {
      return c.json(
        { success: false, error: `Unsupported file type: ${file.name}` },
        400,
      );
    }
  }
  const totalMb = Math.round(
    files.reduce((sum, f) => sum + f.size, 0) / BYTES_PER_MB,
  );
  const userId = c.get("userId");
  const customerData = c.get("customerData");
  if (!(await checkFeature(userId, "storage_mb", totalMb, customerData))) {
    return c.json(
      {
        success: false,
        ...(await quotaError(userId, "storage_mb", customerData)),
      },
      402,
    );
  }
  try {
    const bucket = c.env.MEDIA_BUCKET;
    const tenantRoot = c.get("tenantRoot");
    const bucketId = c.get("bucketId");
    const uploaded: {
      path: string;
      name: string;
      filename: string;
      size: number;
      url: string;
    }[] = [];
    for (const file of files) {
      // Multipart filenames are attacker-controlled: R2 keys are opaque, so a
      // name like "../../other-user/x.png" doesn't traverse, it just writes a
      // key outside the folder the caller was authorized for - and with
      // presigned tokens that caller is an arbitrary end-user of a customer's
      // site, not the account owner. Real browsers only ever put a basename
      // here (directory uploads carry the path in webkitRelativePath, which
      // @openinary/ui doesn't send), so this drops nothing legitimate.
      const fileName = r2
        .stripUrlHostile(file.name.split(/[/\\]/).pop() || "")
        .normalize("NFC");
      if (!fileName || fileName === "." || fileName === "..") {
        return c.json({ success: false, error: "Invalid file name" }, 400);
      }
      const filePath = destFolder ? `${destFolder}/${fileName}` : fileName;
      const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
      // Parsed before the upload so a slow/failed R2 write can't leave a
      // stale duration row; slice()/arrayBuffer() don't touch file.stream().
      const seconds = VIDEO_EXTENSIONS.has(ext)
        ? await parseDuration(file, ext)
        : null;
      await r2.uploadOriginal(
        bucket,
        tenantRoot,
        filePath,
        file.stream(),
        file.type || "application/octet-stream",
      );
      if (seconds != null) {
        const fullPath = `${tenantRoot}/${filePath}`;
        await db
          .insert(mediaDuration)
          .values({ filePath: fullPath, seconds })
          .onConflictDoUpdate({
            target: mediaDuration.filePath,
            set: { seconds },
          });
      }
      // `url` is echoed rather than rebuilt client-side: self-host serves
      // transforms at /t/{path}, cloud at /b/{bucketId}/t/{path} (see the
      // CDN split in worker/index.ts), and letting the server name the
      // delivery prefix is what keeps one component working against both.
      uploaded.push({
        path: filePath,
        name: fileName,
        filename: fileName,
        size: file.size,
        url: `/b/${bucketId}/t/${filePath
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`,
      });
    }
    // Only the bytes the customer actually uploaded. The transform variants
    // the container writes under the cache prefix also sit in R2 and are
    // real cost to us (roughly +40% on top of originals), but they are
    // deliberately NOT metered: that cache is our optimisation, not something
    // the customer asked for, and its size is a function of how many variants
    // we choose to keep. Billing it would make storage usage move for reasons
    // no customer can see or control. It is priced into the per-GB rate
    // instead - see the storage_mb overage in the Autumn catalog. Deleting a
    // file purges its variants too (see the DELETE /storage/* handler), so
    // this overhead stays bounded by real customer data.
    c.executionCtx.waitUntil(
      trackFeature(userId, "storage_mb", totalMb, customerData),
    );
    // Funnel step "first asset uploaded". Server-side so dashboard uploads,
    // API-key uploads and presigned-token uploads all count, under the
    // account owner's user id (see api/lib/analytics.ts).
    c.executionCtx.waitUntil(
      captureEvent("asset_uploaded", userId, {
        files: uploaded.length,
        total_mb: totalMb,
      }),
    );
    return c.json({ success: true, files: uploaded });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Upload failed",
      },
      500,
    );
  }
});

app.post("/upload/createfolder", async (c) => {
  const formData = await c.req.formData();
  const folder = formData.get("folder");
  const folderPath =
    typeof folder === "string"
      ? r2
          .stripUrlHostile(folder.trim())
          .replace(/^\/+|\/+$/g, "")
          .normalize("NFC")
      : "";
  if (!folderPath)
    return c.json({ success: false, error: "Folder name is required" }, 400);
  try {
    await r2.createFolder(c.env.MEDIA_BUCKET, c.get("tenantRoot"), folderPath);
    return c.json({ success: true, folder: folderPath });
  } catch (error) {
    return c.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to create folder",
      },
      500,
    );
  }
});

// --- download ---

// bytes=start-end / bytes=start- / bytes=-suffix, clamped to the object's
// real size. Returns null for anything absent/malformed/unsatisfiable, which
// callers treat as "serve the whole file" (or 416 for out-of-range).
export function parseRangeHeader(
  header: string | null,
  totalSize: number,
): { offset: number; length: number } | null {
  if (!header) return null;
  const match = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  const [, startStr, endStr] = match;
  if (startStr === "" && endStr === "") return null;
  let offset: number;
  let end: number;
  if (startStr === "") {
    offset = Math.max(0, totalSize - Number(endStr));
    end = totalSize - 1;
  } else {
    offset = Number(startStr);
    end =
      endStr === "" ? totalSize - 1 : Math.min(Number(endStr), totalSize - 1);
  }
  if (
    !Number.isFinite(offset) ||
    !Number.isFinite(end) ||
    offset < 0 ||
    offset > end
  )
    return null;
  return { offset, length: end - offset + 1 };
}

app.get("/download/*", async (c) => {
  const requestPath = new URL(c.req.url).pathname;
  const rawFilePath = requestPath.replace(/^\/download\/?/, "");
  if (!rawFilePath) return c.text("File path is required", 400);
  let filePath: string;
  try {
    filePath = decodeURIComponent(rawFilePath)
      .replace(/\.\./g, "")
      .replace(/\\/g, "/")
      .replace(/\/+/g, "/")
      .replace(/^\/+/, "");
  } catch {
    return c.text("Invalid file path", 400);
  }
  if (!filePath) return c.text("Invalid file path", 400);
  const filename = filePath.split("/").pop() || filePath;
  const bucket = c.env.MEDIA_BUCKET;
  const tenantRoot = c.get("tenantRoot");
  try {
    // Range support exists for mediabunny's client-side video-thumbnail
    // reads (see apps/web/src/lib/thumbnails), not for the attachment-
    // download UI, which never sends one - so this only changes behavior
    // for a caller that actually asks for a range.
    const rangeHeader = c.req.header("Range");
    const meta = rangeHeader
      ? await r2.getOriginalMetadata(bucket, tenantRoot, filePath)
      : null;
    if (rangeHeader && !meta) return c.text("File not found", 404);
    const range = meta ? parseRangeHeader(rangeHeader, meta.size) : null;
    if (rangeHeader && !range) return c.text("Range Not Satisfiable", 416);

    const object = range
      ? await r2.downloadOriginalRange(bucket, tenantRoot, filePath, range)
      : await r2.downloadOriginal(bucket, tenantRoot, filePath);
    if (!object) return c.text("File not found", 404);

    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    c.header(
      "Content-Type",
      CONTENT_TYPE_BY_EXT[ext] ?? "application/octet-stream",
    );
    c.header(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(filename)}"`,
    );
    c.header("Accept-Ranges", "bytes");
    c.header("Cache-Control", "private, no-store");
    // mediabunny reads Content-Length/Content-Range across origins to know
    // how much of the file it got and how much is left.
    c.header(
      "Access-Control-Expose-Headers",
      "Content-Length, Content-Range, Accept-Ranges",
    );
    if (range && meta) {
      c.header("Content-Length", String(range.length));
      c.header(
        "Content-Range",
        `bytes ${range.offset}-${range.offset + range.length - 1}/${meta.size}`,
      );
      return c.body(object.body, 206);
    }
    c.header("Content-Length", String(object.size));
    return c.body(object.body);
  } catch (error) {
    console.error("Download failed", error);
    return c.text("Internal server error", 500);
  }
});

// --- video status + queue events ---

// Tenant already resolved by the "/video-status/*" .use(requireTenant) above.
app.all("/video-status/*", async (c) => {
  const url = new URL(c.req.url);
  // url.pathname keeps segments percent-encoded (unlike Hono's c.req.path,
  // which decodes) - undecoded here means the DB lookup below never matches
  // an accented filePath ("Vid%C3%A9os/..." vs the stored "Vidéos/...").
  const rest = decodeURIComponent(
    url.pathname.slice("/video-status".length).replace(/^\/+/, ""),
  );
  // Global, unscoped debug endpoint - no per-tenant story, same treatment as
  // /storage/stats above.
  if (rest === "stats") return c.notFound();
  const tenantRoot = c.get("tenantRoot");
  const isSizeRequest = rest.endsWith("/size");
  const clientPath = isSizeRequest ? rest.slice(0, -"/size".length) : rest;
  return isSizeRequest
    ? videoSizeResponse(c.env, tenantRoot, clientPath)
    : videoStatusResponse(c.env, tenantRoot, clientPath);
});

// Not routed through the shared "/video-status/*" .use(requireTenant) above -
// registered inline on this one route instead, same effect. (The original
// container code went out of its way to avoid an AsyncLocalStorage-based
// tenant middleware here because that context had to stay alive for the SSE
// connection's lifetime; this Worker version only reads a plain string out
// of the context before returning the stream, so that concern doesn't apply
// and the shared middleware works fine.)
app.get("/queue/events", requireTenant, (c) =>
  queueEventsStream(c.get("tenantRoot")),
);
