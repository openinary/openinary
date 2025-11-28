import { Hono } from "hono";
import { cors } from "hono/cors";
import transform from "./routes/transform";
import upload from "./routes/upload";
import storageRoute from "./routes/storage";
import apiKeys from "./routes/api-keys";
import health from "./routes/health";
import { apiKeyAuth } from "./middleware/auth";

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
app.get("/", (c) => c.text("Openinary API Server is running."));

// Health check routes
app.route("/health", health);

// Public routes - no authentication required
// Image transformation route is public for easy access to transformed images
app.route("/t", transform);

// Protected routes - require API key authentication
// Apply middleware before routing
app.use("/upload/*", apiKeyAuth);
app.route("/upload", upload);

app.use("/storage/*", apiKeyAuth);
app.route("/storage", storageRoute);

// API key management routes (also protected)
app.route("/api-keys", apiKeys);

export default app;
