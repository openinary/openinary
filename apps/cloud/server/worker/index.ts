import { WorkerEntrypoint } from "cloudflare:workers";
import { app } from "./app.js";
import { handleCdnRequest } from "./cdn/serve.js";
import { MediaContainer } from "./container.js";
import { mediaContainer } from "./media-container.js";
import { scheduled } from "./cron.js";
import { UsageMeter } from "./usage-meter.js";

export { MediaContainer, UsageMeter };

// Named entrypoint so Workers Caching (see wrangler.jsonc's "exports" block)
// can sit in front of the container: tiered caching (shared across
// datacenters, not just the one that first served an asset) and request
// collapsing (a burst of first-time requests for the same asset invokes this
// once). Safe to enable unconditionally because every /b/* response is either
// an anonymous, cookie-less public asset marked "public, max-age=31536000" or
// an error without that header (left uncached). Only reached on an R2 cache
// miss (see cdn/serve.ts).
export class CdnAssets extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    // No explicit startAndWaitForPorts() before the fetch: containerFetch
    // already runs it, but only when the instance is not already running and
    // healthy. Calling it on every request ran the whole readiness handshake
    // each time - a ping to port 3000 with a 5s timeout and up to 20s of
    // retries, then a blockConcurrencyWhile that halts every other event on
    // this Durable Object. During a transcode ffmpeg pins the single vCPU, the
    // ping is answered slowly, and requests stacked up behind it into 524s and
    // 500s, roughly one in a dozen while a job was encoding. containerFetch
    // also maps start failures properly: 503 for "no instance available", 429
    // when rate limited.
    return mediaContainer(this.env).fetch(request);
  }
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/b/")) {
      return handleCdnRequest(request, env, ctx, url);
    }
    return app.fetch(request, env, ctx);
  },
  scheduled,
};
