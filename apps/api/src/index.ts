import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

// Enable CORS for all origins
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

const router = app
  .get("/", (c) => c.json({ message: "Hello World" }))
  .get("/hello/:name", (c) =>
    c.json({ message: `Hello ${c.req.param("name")}` })
  )
  .get("/private", (c) => c.text("supersecret"));

export default app;

export type AppType = typeof router;