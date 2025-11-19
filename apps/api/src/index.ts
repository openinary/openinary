import { Hono } from "hono";
import { cors } from "hono/cors";
import transform from "./routes/transform";
import upload from "./routes/upload";
import storageRoute from "./routes/storage";

const app = new Hono();

// CORS
app.use(
  "/*",
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// Routes
app.get("/", (c) => c.text("Server is running."));
app.route("/t", transform);
app.route("/upload", upload);
app.route("/storage", storageRoute);
app.get("/health", (c) => c.text("ok"));

export default app;
