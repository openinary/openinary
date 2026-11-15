// Every non-CDN endpoint, served by the Worker itself: auth, oRPC, and the
// /storage, /upload, /download, /buckets, /admin, /video-status and /queue
// routes, backed by the R2 binding and Postgres. Only /b/* ever reaches the
// container (see index.ts).

import { RPCHandler } from "@orpc/server/fetch";
import { Hono, type Next } from "hono";
import { cors } from "hono/cors";
import {
  ADMIN_ORIGIN,
  DASHBOARD_ORIGIN,
  DASHBOARD_ORIGINS,
  isAdmin,
} from "./config.js";
import { auth } from "./lib/auth.js";
import type { Bindings } from "./bindings.js";
import { appRouter } from "./rpc/index.js";
import { adminRoutes } from "./routes/admin.js";
import { bucketRoutes } from "./routes/buckets.js";
import { downloadRoutes } from "./routes/download.js";
import { storageRoutes } from "./routes/storage.js";
import { type AppEnv, type Ctx, requireTenant } from "./routes/tenant.js";
import { uploadRoutes } from "./routes/upload.js";
import { videoRoutes } from "./routes/video.js";

export const app = new Hono<AppEnv>();

// A route that throws answers with the one 500 body the media routes share.
app.onError((error, c) => {
  console.error("%s", `${c.req.method} ${new URL(c.req.url).pathname} failed`, error);
  return c.json(
    {
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    },
    500,
  );
});

// Auth and oRPC are shared by both dashboards: the customer app on
// CORS_ORIGIN and the admin panel on ADMIN_ORIGIN. The media routes stay
// pinned to CORS_ORIGIN alone, and the admin panel's own routes get their own
// policy below.
app.use(
  "/api/*",
  cors({
    origin: DASHBOARD_ORIGINS,
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
  origin: DASHBOARD_ORIGIN,
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
  origin: (origin, c) => (c.req.header("Cookie") ? DASHBOARD_ORIGIN : origin || "*"),
  allowMethods: ["POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "x-api-key"],
  credentials: true,
});

app.use("/storage/*", mediaCors);
app.use("/buckets/*", mediaCors);
// Enumerated rather than "/upload/*": in Hono that wildcard also matches the
// bare "/upload" and would run *after* uploadCors, putting CORS_ORIGIN back
// over the reflected origin and breaking every cross-origin presigned upload.
// The same goes for requireTenant below: POST /upload accepts a session or a
// presigned token, and the token is only readable once the multipart body is
// parsed, so it authenticates inside the handler.
app.use("/upload", uploadCors);
app.use("/upload/sign", mediaCors);
app.use("/upload/createfolder", mediaCors);
app.use("/download/*", mediaCors);
app.use("/queue/*", mediaCors);
app.use("/video-status/*", mediaCors);

app.use("/storage/*", requireTenant);
app.use("/upload/sign", requireTenant);
app.use("/upload/createfolder", requireTenant);
app.use("/download/*", requireTenant);
app.use("/video-status/*", requireTenant);

// The admin panel's routes, pinned to ADMIN_ORIGIN alone: the customer app has
// no business preflighting them, and reflecting its origin would be the only
// thing between a signed-in customer's browser and a delete-account call.
app.use(
  "/admin/*",
  cors({
    origin: ADMIN_ORIGIN,
    allowMethods: ["GET", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    credentials: true,
  }),
);

/**
 * Same isAdmin as adminProcedure (rpc/orpc.ts). Not requireTenant: that also
 * accepts API keys, and no media key may ever reach an admin route.
 */
async function requireAdmin(c: Ctx, next: Next) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  // 401 and 403 are told apart on purpose: the admin panel's middleware sends
  // the first to the dashboard to sign in and hard-refuses the second, so a
  // customer who wanders onto the admin host is never bounced through a
  // sign-in flow that could not possibly help them.
  if (!session?.user) return c.json({ error: "Unauthorized" }, 401);
  if (!isAdmin(session.user.id)) return c.json({ error: "Forbidden" }, 403);
  await next();
}
app.use("/admin/*", requireAdmin);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

const orpcHandler = new RPCHandler(appRouter);
app.use("/api/rpc/*", async (c, next) => {
  const headers = c.req.raw.headers;
  // Typed against Bindings without a cast: a binding that drifts from what
  // the routers expect fails the Worker's type-check here.
  const env: Bindings = c.env;
  const { matched, response } = await orpcHandler.handle(c.req.raw, {
    prefix: "/api/rpc",
    context: { session: await auth.api.getSession({ headers }), headers, env },
  });
  if (matched) return c.newResponse(response.body, response);
  await next();
});

app.get("/api", (c) => c.text("OK"));

bucketRoutes(app);
adminRoutes(app);
storageRoutes(app);
uploadRoutes(app);
downloadRoutes(app);
videoRoutes(app);
