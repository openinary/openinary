import { Hono } from "hono";
import { compress } from "hono/compress";
import { cors } from "hono/cors";
import { allowedOrigins, mediaActionFor } from "shared";
import {
  createTransformRoute,
  createAuthenticatedRoute,
  createStorageRoute,
  createDownloadRoute,
  createDownloadFolderRoute,
  createDownloadZipRoute,
  createVideoStatusRoute,
  createQueueEventsRoute,
  createQueueRoute,
  createInvalidateRoute,
  validateApiSecret,
  logger,
  serializeError,
  type RouteDeps,
} from "@openinary/core";
import { createUploadRoute } from "./routes/upload";
import apiKeys from "./routes/api-keys";
import activity from "./routes/activity";
import onboarding from "./routes/onboarding";
import health from "./routes/health";
import { logDelivery, noteApiUpload } from "./middleware/activity";
import { apiKeyAuth, requirePermission } from "./middleware/auth";
import { publicRateLimit } from "./middleware/rate-limit";
import { getSharedStorage } from "./config/storage";
import { enginePaths, videoJobQueue } from "./config/queue";

// Logged, not fatal: only /authenticated and presigned uploads need the
// secret, and they answer 500 without it.
try {
  validateApiSecret(process.env.API_SECRET);
} catch (error) {
  logger.error(
    { error: serializeError(error) },
    "API_SECRET validation failed at startup",
  );
}

const deps: RouteDeps = {
  storage: getSharedStorage(),
  queue: videoJobQueue,
  paths: enginePaths,
  apiSecret: process.env.API_SECRET,
  allowRemoteSource: process.env.ALLOW_REMOTE_SOURCE === "true",
};

const transform = createTransformRoute(deps);
const authenticated = createAuthenticatedRoute(deps);
const upload = createUploadRoute(deps);
const storageRoute = createStorageRoute(deps);
const download = createDownloadRoute(deps);
const downloadFolder = createDownloadFolderRoute(deps);
const downloadZip = createDownloadZipRoute(deps);
const videoStatus = createVideoStatusRoute(deps);
const queueEvents = createQueueEventsRoute(deps);
const queue = createQueueRoute(deps);
const invalidateRoute = createInvalidateRoute(deps);

const app = new Hono();

// Credentials allowed for the dashboard's session cookie.
app.use(
  "/*",
  cors({
    origin: (origin) => {
      // CORS_ORIGIN: comma-separated sites embedding the file uploader.
      const allowed = [
        ...allowedOrigins(),
        ...(process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()) ?? []),
      ];
      if (!origin || allowed.includes("*")) return origin || "*";
      // Empty for a disallowed origin, so the browser blocks the response.
      return allowed.includes(origin) ? origin : "";
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowHeaders: ["Content-Type", "Authorization", "Cookie"],
    credentials: true,
    exposeHeaders: ["Set-Cookie"],
  }),
);

// Public routes are rate limited here; protected ones by Better Auth's API
// key plugin.
app.get("/", publicRateLimit, (c) =>
  c.text("Openinary API Server is running."),
);

app.use("/health", publicRateLimit);
app.use("/health/*", publicRateLimit);
app.route("/health", health);

app.use("/video-status", publicRateLimit);
app.use("/video-status/*", publicRateLimit);
app.route("/video-status", videoStatus);

app.use("/t", publicRateLimit);
app.use("/t/*", publicRateLimit);
app.use("/t/*", logDelivery("/t"));
app.route("/t", transform);

app.use("/download", publicRateLimit);
app.use("/download/*", publicRateLimit);
app.route("/download", download);

app.use("/download-folder", publicRateLimit);
app.use("/download-folder/*", publicRateLimit);
app.route("/download-folder", downloadFolder);

// Public too: the URL's signature is the authorization.
app.use("/authenticated", publicRateLimit);
app.use("/authenticated/*", publicRateLimit);
app.use("/authenticated/*", logDelivery("/authenticated"));
app.route("/authenticated", authenticated);

// Registered before the protected /queue/* so it stays public.
app.use("/queue/events", publicRateLimit);
app.use("/queue/events/*", publicRateLimit);
app.route("/queue/events", queueEvents);

// POST /upload accepts either a real API key/session, or a short-lived
// presigned signature minted by POST /upload/sign, so it gets its own
// auth handling (see presignedOrApiKeyAuth) plus public rate limiting,
// while the other /upload/* subroutes stay strictly API-key protected.
// Each route checks its role after authenticating; POST /upload does so in
// the upload route, after its own auth.
const mediaWrite = requirePermission("media:write");
const mediaRead = requirePermission("media:read");
app.use("/upload", publicRateLimit);
app.use("/upload", noteApiUpload);
app.use("/upload/sign", apiKeyAuth, mediaWrite);
app.use("/upload/createfolder", apiKeyAuth, mediaWrite);
app.route("/upload", upload);

// Compression scoped to /storage (large JSON listings); not global because
// /queue/events streams SSE and /t/* serves already-compressed media
app.use("/storage/*", compress());
app.use("/storage/*", apiKeyAuth);
app.use("/storage/*", requirePermission((c) => mediaActionFor(c.req.method)));
app.route("/storage", storageRoute);

// A POST, but it only reads.
app.use("/download-zip", apiKeyAuth, mediaRead);
app.use("/download-zip/*", apiKeyAuth, mediaRead);
app.route("/download-zip", downloadZip);

app.use("/invalidate/*", apiKeyAuth, mediaWrite);
app.route("/invalidate", invalidateRoute);

app.use("/queue/*", apiKeyAuth);
app.use(
  "/queue/*",
  requirePermission((c) => (mediaActionFor(c.req.method) === "media:read" ? "media:read" : "queue:manage")),
);
app.route("/queue", queue);

app.use("/activity", apiKeyAuth, mediaRead);
app.use("/activity/*", apiKeyAuth, mediaRead);
app.route("/activity", activity);

// Anyone signed in saves their own answers; the route itself guards the
// instance-wide workspace.
app.use("/onboarding", apiKeyAuth);
app.use("/onboarding/*", apiKeyAuth);
app.get("/onboarding", mediaRead);
app.route("/onboarding", onboarding);

// Applies apiKeyAuth and its permission itself.
app.route("/api-keys", apiKeys);

export default app;
