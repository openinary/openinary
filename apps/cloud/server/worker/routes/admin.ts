// The admin panel's REST routes: the ones that need the R2 binding, which the
// oRPC routers can't name (see bindings.ts). Everything else the admin
// panel does is in rpc/admin.ts. Gated by requireAdmin in app.ts.

import { eq, inArray } from "drizzle-orm";
import {
  extOf,
  isTransformableImageExt,
  isVideoExt,
  normalizeLevelPath,
} from "@openinary/core/url";
import { db } from "../../shared/db/index.js";
import { user } from "../../shared/db/schema/auth.js";
import { bucket } from "../../shared/db/schema/bucket.js";
import { accountRootFor, tenantRootFor } from "../../shared/tenant.js";
import { deleteFile, deleteTenant } from "../assets.js";
import { decodeSegment, parseAssetRef } from "../cdn/path.js";
import { isAdmin } from "../config.js";
import { deletePerson, findPersonByEmail } from "../lib/attio.js";
import { auth } from "../lib/auth.js";
import { deleteCustomer } from "../lib/billing.js";
import { getBucketOwner, listBuckets, ownsBucket } from "../lib/bucket.js";
import { forgetContact } from "../lib/loops.js";
import { meterFor } from "../lib/meter.js";
import { deleteDurationsUnder } from "../media-duration.js";
import { forgetBuckets } from "../owner-cache.js";
import * as r2 from "../r2-storage.js";
import { objectResponse, servedRange } from "../responses.js";
import { deleteVideoJobsUnder } from "../video-jobs.js";
import { parseList } from "./params.js";
import { thumbnailCacheKey } from "../cdn/dashboard-thumbs.js";
import type { App, Ctx } from "./tenant.js";

/**
 * The bucket in the URL, checked against the user in the URL, so a mistyped
 * id can't land the browser in someone else's tenant root.
 */
async function adminTenantRoot(c: Ctx): Promise<string | null> {
  const { userId, bucketId } = c.req.param();
  return (await ownsBucket(userId, bucketId))
    ? tenantRootFor(userId, bucketId)
    : null;
}

const bucketNotFound = (c: Ctx) =>
  c.json({ error: "Not found", message: "Bucket not found" }, 404);

const FOOTPRINT_MAX_AGE_MS = 60 * 60 * 1000;

export function adminRoutes(app: App): void {
  /**
   * Is the caller the administrator? The answer is the status code - 204, 401
   * or 403, all three produced by requireAdmin before this handler is reached.
   * Exists so apps/cloud/admin can decide whether to serve a page at all
   * without holding its own copy of ADMIN_USER_ID, which would drift.
   */
  app.get("/admin/check", (c) => c.body(null, 204));

  /**
   * GET /admin/storage?users=a,b,c - each account's footprint across all of its
   * buckets, for the user list. The per-bucket snapshot in Postgres is only
   * refreshed when the customer presses "Recalculate", which almost nobody
   * does, so this refreshes any bucket whose snapshot is older than an hour
   * straight from R2 and writes it back, so the fiche and the customer's own
   * Storage tab agree with it. Originals only: the cache has no per-tenant
   * prefix, so its columns are left alone.
   *
   * ponytail: one R2 list per stale bucket per page of the user list, in
   * parallel; a tenant with 100k objects is 100 subrequests. Move to a cron if
   * a page ever brushes the Worker's 1000-subrequest budget.
   */
  app.get("/admin/storage", async (c) => {
    const parsed = parseList(c.req.query("users"), Number.POSITIVE_INFINITY);
    const ids = typeof parsed === "string" ? [] : parsed.slice(0, 200);
    const footprint: Record<string, { bytes: number; files: number }> = {};
    for (const id of ids) footprint[id] = { bytes: 0, files: 0 };
    if (ids.length === 0) return c.json(footprint);

    try {
      const rows = await db
        .select({
          id: bucket.id,
          userId: bucket.userId,
          storageBytes: bucket.storageBytes,
          storageFileCount: bucket.storageFileCount,
          statsUpdatedAt: bucket.statsUpdatedAt,
        })
        .from(bucket)
        .where(inArray(bucket.userId, ids));

      const now = Date.now();
      await Promise.all(
        rows.map(async (row) => {
          let { storageBytes, storageFileCount } = row;
          const fresh =
            row.statsUpdatedAt &&
            now - row.statsUpdatedAt.getTime() < FOOTPRINT_MAX_AGE_MS;
          if (!fresh) {
            const originals = await r2.listOriginals(
              c.env.MEDIA_BUCKET,
              tenantRootFor(row.userId, row.id),
            );
            storageBytes = originals.reduce((sum, o) => sum + o.size, 0);
            storageFileCount = originals.length;
            await db
              .update(bucket)
              .set({ storageBytes, storageFileCount, statsUpdatedAt: new Date() })
              .where(eq(bucket.id, row.id));
          }
          const total = footprint[row.userId];
          total.bytes += storageBytes;
          total.files += storageFileCount;
        }),
      );
      return c.json(footprint);
    } catch (error) {
      console.error("Failed to compute storage footprint for admin", error);
      return c.json({ error: "Failed to compute storage footprint" }, 500);
    }
  });

  // The file browser behind /users/{id}/buckets/{bucketId} in the admin panel,
  // read straight from R2 rather than through the public CDN: a moderator most
  // needs to look at an account that is already suspended (the CDN answers
  // 403 for it), and being looked at must not bill the customer.

  // GET /admin/users/:userId/buckets/:bucketId/storage?path= - one directory
  // level, same shape as the customer's own GET /storage.
  app.get("/admin/users/:userId/buckets/:bucketId/storage", async (c) => {
    const tenantRoot = await adminTenantRoot(c);
    if (!tenantRoot) return bucketNotFound(c);
    const levelPath = normalizeLevelPath(c.req.query("path") ?? "");
    if (levelPath === null)
      return c.json({ error: "Bad request", message: "Invalid path" }, 400);
    try {
      return c.json(
        await r2.listLevel(c.env.MEDIA_BUCKET, tenantRoot, levelPath),
      );
    } catch (error) {
      console.error("Failed to list bucket for admin", error);
      return c.json({ error: "Failed to list storage contents" }, 500);
    }
  });

  /**
   * GET /admin/users/:userId/buckets/:bucketId/file/{path}[?thumb=1] - the
   * bytes of one original. With ?thumb=1 an image or video is answered with
   * the dashboard thumbnail the customer's browser already generated when
   * there is one (a few KB of webp instead of the full original, which is what
   * makes a grid of a thousand files bearable), falling back to the original.
   * Ranged like the CDN so a <video> can seek and Safari plays at all.
   */
  app.get("/admin/users/:userId/buckets/:bucketId/file/*", async (c) => {
    const tenantRoot = await adminTenantRoot(c);
    if (!tenantRoot) return bucketNotFound(c);
    const filePath = decodeSegment(
      new URL(c.req.url).pathname.replace(
        /^\/admin\/users\/[^/]+\/buckets\/[^/]+\/file\//,
        "",
      ),
    );
    if (!filePath)
      return c.json(
        { error: "Bad request", message: "File path is required" },
        400,
      );

    const ext = extOf(filePath);
    const isImage = isTransformableImageExt(ext);
    const wantsThumb =
      c.req.query("thumb") === "1" && (isImage || isVideoExt(ext));
    const media = c.env.MEDIA_BUCKET;
    const wantsRange = c.req.raw.headers.has("Range");
    try {
      const object =
        (wantsThumb
          ? await media.get(thumbnailCacheKey(`${tenantRoot}/${filePath}`, isImage))
          : null) ??
        (await r2.downloadOriginal(
          media,
          tenantRoot,
          filePath,
          wantsRange ? { range: c.req.raw.headers } : undefined,
        ));
      if (!object)
        return c.json({ error: "Not found", message: "File not found" }, 404);

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      if (!headers.has("Content-Type"))
        headers.set("Content-Type", "application/octet-stream");
      // Private: this is one admin's browser, and the bytes must never land in
      // a shared cache under a URL that only a cookie protects.
      headers.set("Cache-Control", "private, max-age=3600");
      headers.set("ETag", object.httpEtag);
      headers.set("Accept-Ranges", "bytes");
      return objectResponse(object, headers, wantsRange ? servedRange(object) : null);
    } catch (error) {
      console.error("Failed to read file for admin", error);
      return c.json({ error: "Failed to read file" }, 500);
    }
  });

  /**
   * DELETE /admin/asset { ref } - legal takedown. `ref` is whatever the
   * complaint quoted: a full CDN URL, a "/b/..." path, or "{bucketId}/file".
   * The owner is resolved from the bucket rather than supplied, so a takedown
   * can't be aimed at a path under someone else's tenant root by hand-editing
   * the reference. Same deleteFile as the customer's own delete, so a legal
   * takedown can't quietly leave behind a derivative theirs would have swept.
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

    const deleted = await deleteFile(
      c.env.MEDIA_BUCKET,
      tenantRootFor(userId, parsed.bucketId),
      parsed.filePath,
    );
    if (!deleted)
      return c.json({ error: "Not found", message: "File not found" }, 404);
    c.executionCtx.waitUntil(
      meterFor(c.env.USAGE_METER, userId).trackStorage(-deleted.bytes),
    );
    return c.json({
      success: true,
      userId,
      ...parsed,
      jobsDeleted: deleted.jobsDeleted,
      cloudCacheFilesDeleted: deleted.cloudCacheFilesDeleted,
    });
  });

  /**
   * DELETE /admin/users/:userId - erases the account from every system it
   * exists in: R2, Postgres, the KV owner cache, its UsageMeter instance,
   * Autumn (and Stripe), Attio, and Loops.
   *
   * R2 before Postgres, because nothing but a `bucket` row maps a tenant root
   * back to an account: dropping the rows first would orphan every object
   * permanently, while a half-finished sweep just leaves an account that can
   * be deleted again. removeUser is last for the same reason, and takes
   * `session`, `account` and `apikey` with it through their foreign keys.
   */
  app.delete("/admin/users/:userId", async (c) => {
    const userId = c.req.param("userId");
    if (isAdmin(userId))
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

    const buckets = await listBuckets(userId);
    for (const { id } of buckets) {
      await deleteTenant(c.env.MEDIA_BUCKET, tenantRootFor(userId, id));
    }
    // Rows of buckets that no longer exist, if any were left behind.
    await deleteDurationsUnder(accountRootFor(userId));
    await deleteVideoJobsUnder(accountRootFor(userId));

    // The meter first, so its next flush can't write the buckets back into
    // the owner cache right after they were dropped.
    await meterFor(c.env.USAGE_METER, userId).wipe();
    await forgetBuckets(
      c.env.BUCKET_OWNERS,
      buckets.map(({ id }) => id),
    );
    await db.delete(bucket).where(eq(bucket.userId, userId));

    // Third parties last among the fallible steps: each logs and continues, so
    // a CRM outage can't leave the account half-deleted in our own systems.
    await deleteCustomer(userId).catch((error) =>
      console.error("%s", `Failed to delete Autumn customer ${userId}`, error),
    );
    const person = await findPersonByEmail(account[0].email).catch(() => null);
    if (person)
      await deletePerson(person.recordId).catch((error) =>
        console.error("%s", `Failed to delete Attio record for ${userId}`, error),
      );
    // Deleting the contact is also what pulls them out of any lifecycle
    // sequence they are part-way through - see forgetContact.
    await forgetContact(userId);

    await auth.api.removeUser({
      headers: c.req.raw.headers,
      body: { userId },
    });
    return c.body(null, 204);
  });
}
