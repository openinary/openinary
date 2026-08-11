import "dotenv/config";
import { serve } from "@hono/node-server";
import { createTransformRoute } from "@openinary/core";
import { Hono } from "hono";
import { queue, storage } from "./lib/media.js";

// The container now only serves media transformation (sharp/ffmpeg) - every
// other endpoint (auth, oRPC, storage/upload/download, video-status, queue
// events) moved into the Cloudflare Worker in front of it (see
// worker/app.ts). Mounted at "/t" because @openinary/ui and the Worker's
// scopeUpstreamPath both build paths shaped "/t/{params}/{path}".
const app = new Hono();
app.route("/t", createTransformRoute({ storage, queue }));

const port = Number(process.env.PORT) || 3000;
serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);

// Node runs as PID 1 in this container (no init system - see Dockerfile). A
// PID-1 process is immune to a signal's *default* action unless it installs
// its own handler for that signal (Linux kernel behavior), so without this,
// SIGTERM - what Cloudflare's Container.stop() sends when sleepAfter's
// activity timeout expires - was silently ignored and the container never
// actually exited, only getting reaped much later by a harsher mechanism.
process.on("SIGTERM", () => process.exit(0));
