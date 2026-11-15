// The one MediaContainer instance every caller talks to. Singleton, not
// getRandom's default pool of 3: at current traffic one instance absorbs
// cache-miss bursts fine, and every extra instance woken bills its own
// processing + 2m sleepAfter tail (metrics showed 3 instances awake in
// parallel for a handful of requests). This, not wrangler.jsonc's
// max_instances, is what caps transform concurrency at 1.
//
// Same instance as @cloudflare/containers' getContainer(binding) default (its
// singletonContainerId), written out so modules the node tests load (the Hono
// app, through processing-eta.ts) don't pull that package's
// cloudflare:workers import.
//
// ponytail: singleton container; switch to getRandom(binding, n) when job
// wait time (video_job.startedAt - createdAt, recorded for every job) shows
// real queueing. That's the signal, not account count.
const SINGLETON = "cf-singleton-container";

export function mediaContainer(env: Env) {
  return env.MEDIA_CONTAINER.get(env.MEDIA_CONTAINER.idFromName(SINGLETON));
}
