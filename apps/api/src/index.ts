import { Hono } from "hono";
import { cors } from "hono/cors";
import transform from "./routes/transform";
import authenticated from "./routes/authenticated";
import upload from "./routes/upload";
import storageRoute from "./routes/storage";
import apiKeys from "./routes/api-keys";
import health from "./routes/health";
import videoStatus from "./routes/video-status";
import logger from "./utils/logger";
import queueEvents from "./routes/queue-events";
import queue from "./routes/queue";
import invalidateRoute from "./routes/invalidate";
import { apiKeyAuth } from "./middleware/auth";
import { publicRateLimit } from "./middleware/rate-limit";
import { validateApiSecret } from "./utils/signature";

// Validate API_SECRET at startup if authenticated routes are enabled
// This ensures the application fails fast if the secret is not configured properly
try {
  validateApiSecret(process.env.API_SECRET);
} catch (error) {
  logger.error({ error }, "API_SECRET validation failed at startup");
  // For now, we only log the error to allow the app to start
  // The authenticated route will return 500 errors if API_SECRET is missing
  // In production, you may want to throw the error to prevent startup
}

const app = new Hono();

// CORS - Allow credentials for session cookies
app.use(
  "/*",
  cors({
    origin: (origin) => {
      // Allow requests from Next.js app or configured origins
      const allowedOrigins = [
        "http://localhost:3001", // Next.js dev
        "http://localhost:3000", // API itself
        process.env.CORS_ORIGIN,
      ].filter(Boolean);

      if (!origin || allowedOrigins.includes("*")) {
        return origin || "*";
      }

      return allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowHeaders: ["Content-Type", "Authorization", "Cookie"],
    credentials: true, // Important: allow cookies
    exposeHeaders: ["Set-Cookie"],
  })
);

// Public routes (no authentication required)
// Rate limiting is applied to these routes only (protected routes have their own rate limiting via better-auth)

// Root endpoint
app.get("/", publicRateLimit, (c) => c.text("Openinary API Server is running."));

// Health check routes
app.use("/health", publicRateLimit);
app.use("/health/*", publicRateLimit);
app.route("/health", health);

// Video status check (public - no auth required)
app.use("/video-status", publicRateLimit);
app.use("/video-status/*", publicRateLimit);
app.route("/video-status", videoStatus);

// Image transformation route is public for easy access to transformed images
app.use("/t", publicRateLimit);
app.use("/t/*", publicRateLimit);
app.route("/t", transform);

// Authenticated image transformation route (with signature verification)
app.use("/authenticated", publicRateLimit);
app.use("/authenticated/*", publicRateLimit);
app.route("/authenticated", authenticated);

// Queue events SSE endpoint (public for real-time updates)
// This must be registered BEFORE the protected queue routes to avoid auth conflicts
app.use("/queue/events", publicRateLimit);
app.use("/queue/events/*", publicRateLimit);
app.route("/queue/events", queueEvents);

// Protected routes - require API key authentication
// Apply middleware before routing
app.use("/upload/*", apiKeyAuth);
app.route("/upload", upload);

app.use("/storage/*", apiKeyAuth);
app.route("/storage", storageRoute);

// Cache invalidation route (protected)
app.use("/invalidate/*", apiKeyAuth);
app.route("/invalidate", invalidateRoute);

// Queue management routes (protected)
// Note: /queue/events is public (registered above), but other /queue/* routes require auth
app.use("/queue/*", apiKeyAuth);
app.route("/queue", queue);

// API key management routes (also protected)
app.route("/api-keys", apiKeys);

export default app;
