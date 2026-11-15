import "dotenv/config";
import { serve } from "@hono/node-server";
import { createTransformRoute } from "@openinary/core";
import { CACHE_PARAMS_HEADER } from "@openinary/core/url";
import { Hono } from "hono";
import { parseCacheParamsHeader, requestCacheParams } from "./cache-params.js";
import { paths, queue, storage } from "./media.js";

// The container only serves media transformation (sharp/ffmpeg); every other
// endpoint lives in the Cloudflare Worker in front of it (worker/app.ts).
// Mounted at "/t" because the Worker forwards paths shaped
// "/t/{params}/{path}" (upstreamPath in worker/cdn/path.ts).
const app = new Hono();
// Runs the whole transform inside the Worker's cache params (see
// cache-params.ts) so the derivative lands under the key the Worker
// looks up and meters. The container is only reachable through the Worker,
// which always overwrites this header.
app.use("/t/*", (c, next) =>
  requestCacheParams.run(
    parseCacheParamsHeader(c.req.header(CACHE_PARAMS_HEADER)),
    next,
  ),
);
app.route("/t", createTransformRoute({ storage, queue, paths }));

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
