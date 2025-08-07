import { Hono } from "hono";
import transform from "./routes/transform";

const app = new Hono();

// Routes
app.get("/", (c) => c.text("Server is running."));
app.route("/t", transform);
app.get("/health", (c) => c.text("ok"));

export default app;
