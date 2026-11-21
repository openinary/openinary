import { Hono } from "hono";
import { compress } from "hono/compress";
import { cors } from "hono/cors";
import { allowedOrigins } from "shared";
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
import { measureDelivery } from "./middleware/metrics";
import { apiKeyAuth } from "./middleware/auth";
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
app.use("/t/*", measureDelivery("t"));
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
app.use("/authenticated/*", measureDelivery("authenticated"));
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
app.use("/upload", publicRateLimit);
app.use("/upload", noteApiUpload);
app.use("/upload/sign", apiKeyAuth);
app.use("/upload/createfolder", apiKeyAuth);
app.route("/upload", upload);

// Compression scoped to /storage (large JSON listings); not global because
// /queue/events streams SSE and /t/* serves already-compressed media
app.use("/storage/*", compress());
app.use("/storage/*", apiKeyAuth);
app.route("/storage", storageRoute);

app.use("/download-zip", apiKeyAuth);
app.use("/download-zip/*", apiKeyAuth);
app.route("/download-zip", downloadZip);

app.use("/invalidate/*", apiKeyAuth);
app.route("/invalidate", invalidateRoute);

app.use("/queue/*", apiKeyAuth);
app.route("/queue", queue);

app.use("/activity", apiKeyAuth);
app.use("/activity/*", apiKeyAuth);
app.route("/activity", activity);

app.use("/onboarding", apiKeyAuth);
app.use("/onboarding/*", apiKeyAuth);
app.route("/onboarding", onboarding);

// Applies apiKeyAuth itself.
app.route("/api-keys", apiKeys);

export default app;
