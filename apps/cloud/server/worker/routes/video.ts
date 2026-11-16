// /video-status, /video-status/*/size and /queue/events SSE. Read from
// Postgres (video_job, mirrored by the container's PgVideoJobStore) and R2
// directly instead of the container's in-memory VideoJobQueue, so status
// polling and the dashboard's SSE connection never wake or keep the
// container alive.

import { legacyCloudKey } from "@openinary/core/url";
import { resolveStatusTarget } from "../cdn/overlay.js";
import { videoProcessingEstimate } from "../processing-eta.js";
import { findVideoJob, tenantVideoJobs } from "../video-jobs.js";
import { decodeSegment } from "../cdn/path.js";
import { type App, requireTenant } from "./tenant.js";

// Same answers as core's video status route: job status if a job exists,
// else "completed" if a cached transform already exists in R2, else 404.
// Without core's local-disk cache fallback: the Worker has no disk.
async function videoStatusResponse(
  env: Env,
  tenantRoot: string,
  clientPath: string,
): Promise<Response> {
  const { filePath, params, jobParams } = resolveStatusTarget(tenantRoot, clientPath);
  const job = await findVideoJob(filePath, jobParams);

  if (!job) {
    const cached = await env.MEDIA_BUCKET.head(
      legacyCloudKey(filePath, params),
    );
    if (cached) return Response.json({ status: "completed", progress: 100 });
    return Response.json(
      {
        status: "not_found",
        message: "No processing job found for this video",
      },
      { status: 404 },
    );
  }

  const status = job.status === "error" && job.error ? "error" : job.status;
  const body: Record<string, unknown> = { status, progress: job.progress || 0 };
  if (job.startedAt != null)
    body.startedAt = new Date(job.startedAt).toISOString();
  if (job.completedAt != null)
    body.completedAt = new Date(job.completedAt).toISOString();
  if (job.error) body.error = job.error;
  // Same estimate the transform URL's 202 carries.
  if (status === "pending" || status === "processing") {
    const estimate = await videoProcessingEstimate(env, filePath, jobParams);
    body.phase = estimate.phase;
    body.estimatedSeconds = estimate.estimatedSeconds;
    body.estimatedRange = estimate.estimatedRange;
    body.retryAfter = estimate.retryAfter;
  }
  return Response.json(body);
}

// The optimized (post-compression) file size, read straight from R2 metadata:
// a cache object existing is definitionally "ready".
async function videoSizeResponse(
  env: Env,
  tenantRoot: string,
  clientPath: string,
): Promise<Response> {
  const { filePath, params } = resolveStatusTarget(tenantRoot, clientPath);
  const cached = await env.MEDIA_BUCKET.head(legacyCloudKey(filePath, params));
  if (cached) return Response.json({ size: cached.size, status: "ready" });
  return Response.json(
    { status: "not_found", message: "Optimized video not found" },
    { status: 404 },
  );
}

const HEARTBEAT_MS = 30_000;
const ACTIVE_POLL_MS = 2_000;
const IDLE_POLL_MS = 15_000;
// ponytail: hard cap so a forgotten tab doesn't poll Postgres forever -
// EventSource auto-reconnects, so the client just opens a fresh stream.
const MAX_STREAM_MS = 5 * 60_000;

type JobStatus = "pending" | "processing" | "completed" | "error" | "cancelled";

// Same event names and shapes as core's queue events stream, which
// @openinary/ui's useQueueEvents hook expects, but sourced by polling Postgres
// for this tenant's jobs: the container's in-memory EventEmitter is out of
// the Worker's reach.
function queueEventsStream(tenantRoot: string): Response {
  const encoder = new TextEncoder();
  const tenantPrefix = `${tenantRoot}/`;
  const unscopedPath = (filePath: string) =>
    filePath.startsWith(tenantPrefix)
      ? filePath.slice(tenantPrefix.length)
      : filePath;

  let closed = false;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
          );
        } catch {
          closed = true;
        }
      };

      const stop = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeatTimer);
        clearTimeout(pollTimer);
        try {
          controller.close();
        } catch {
          // already closed client-side
        }
      };

      send("connected", { clientId: Math.random().toString(36).substring(7) });
      heartbeatTimer = setInterval(
        () => send("heartbeat", { timestamp: Date.now() }),
        HEARTBEAT_MS,
      );

      const known = new Map<string, { status: JobStatus; progress: number }>();
      const streamStartedAt = Date.now();

      const poll = async () => {
        if (closed) return;
        try {
          const rows = await tenantVideoJobs(tenantRoot);

          let hasActive = false;
          for (const job of rows) {
            const status = job.status as JobStatus;
            if (status === "pending" || status === "processing")
              hasActive = true;
            const prev = known.get(job.id);
            const filePath = unscopedPath(job.filePath);

            if (!prev) {
              send("job:created", {
                jobId: job.id,
                filePath,
                status,
                priority: job.priority,
              });
              if (status === "processing")
                send("job:started", { jobId: job.id, filePath, status });
            } else if (
              prev.status !== "processing" &&
              status === "processing"
            ) {
              send("job:started", { jobId: job.id, filePath, status });
            }
            if (!prev || prev.progress !== job.progress) {
              send("job:progress", { jobId: job.id, progress: job.progress });
            }
            if (prev?.status !== "completed" && status === "completed") {
              send("job:completed", { jobId: job.id, filePath, status });
            }
            if (prev?.status !== "error" && status === "error" && job.error) {
              send("job:error", {
                jobId: job.id,
                filePath,
                status,
                error: job.error,
              });
            }

            if (
              status === "completed" ||
              status === "error" ||
              status === "cancelled"
            ) {
              known.delete(job.id);
            } else {
              known.set(job.id, { status, progress: job.progress });
            }
          }

          if (Date.now() - streamStartedAt > MAX_STREAM_MS) {
            stop();
            return;
          }
          pollTimer = setTimeout(
            poll,
            hasActive ? ACTIVE_POLL_MS : IDLE_POLL_MS,
          );
        } catch (error) {
          console.error("queue/events poll failed", error);
          pollTimer = setTimeout(poll, IDLE_POLL_MS);
        }
      };

      pollTimer = setTimeout(poll, 0);
    },
    cancel() {
      closed = true;
      clearInterval(heartbeatTimer);
      clearTimeout(pollTimer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export function videoRoutes(app: App): void {
  // Tenant already resolved by the "/video-status/*" requireTenant in app.ts.
  app.all("/video-status/*", async (c) => {
    // url.pathname keeps segments percent-encoded (unlike Hono's c.req.path,
    // which decodes) - undecoded, the DB lookup never matches an accented
    // filePath ("Vid%C3%A9os/..." vs the stored "Vidéos/...").
    const rest = decodeSegment(
      new URL(c.req.url).pathname
        .slice("/video-status".length)
        .replace(/^\/+/, ""),
    );
    const tenantRoot = c.get("tenantRoot");
    return rest.endsWith("/size")
      ? videoSizeResponse(c.env, tenantRoot, rest.slice(0, -"/size".length))
      : videoStatusResponse(c.env, tenantRoot, rest);
  });

  app.get("/queue/events", requireTenant, (c) =>
    queueEventsStream(c.get("tenantRoot")),
  );
}
