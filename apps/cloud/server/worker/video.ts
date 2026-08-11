// Worker-native /video-status, /video-status/*/size and /queue/events SSE.
// Reads Postgres (video_job, mirrored by the container's PgVideoJobStore -
// see api/lib/video-job-store.ts) and R2 (MEDIA_BUCKET) directly instead of
// going through the container's in-memory VideoJobQueue, so status polling
// and the dashboard's SSE connection no longer wake or keep the container
// alive. The container remains the only writer of video_job rows.

import { and, desc, eq, like } from "drizzle-orm";
import { db } from "../api/db/index.js";
import { videoJob } from "../api/db/schema/video-job.js";
import { generateCacheKey, parseParams } from "./transform-cache.js";

// Mirrors PgVideoJobStore's serializeParams (video-job-store.ts): a plain
// JSON.stringify, in parseTransform's insertion order. Both used to sort the
// keys first; see that function's comment for why sorting was not merely
// unnecessary but actively broke the R2 cache key.

// Mirrors createVideoStatusRoute's GET /*: job status if a job exists,
// else "completed" if a cached transform already exists in R2, else 404.
// Drops core's local-disk cache fallback (no local disk in the Worker) -
// accepted simplification, see plan.
export async function videoStatusResponse(
  env: Env,
  tenantRoot: string,
  clientPath: string,
): Promise<Response> {
  const filePath = `${tenantRoot}/${clientPath}`;
  const params = parseParams(`/t/${clientPath}`);
  const paramsJson = JSON.stringify(params);

  const [job] = await db
    .select()
    .from(videoJob)
    .where(
      and(eq(videoJob.filePath, filePath), eq(videoJob.paramsJson, paramsJson)),
    )
    .orderBy(desc(videoJob.createdAt))
    .limit(1);

  if (!job) {
    const cached = await env.MEDIA_BUCKET.head(
      generateCacheKey(filePath, params),
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
  return Response.json(body);
}

// Mirrors createVideoStatusRoute's GET /*/size: the optimized (post-
// compression) file size, read straight from R2 metadata - no need to also
// check the job table, a cache object existing is definitionally "ready".
export async function videoSizeResponse(
  env: Env,
  tenantRoot: string,
  clientPath: string,
): Promise<Response> {
  const filePath = `${tenantRoot}/${clientPath}`;
  const cached = await env.MEDIA_BUCKET.head(
    generateCacheKey(filePath, parseParams(`/t/${clientPath}`)),
  );
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

// Worker-native port of queue-events-route.ts's SSE handler: same event
// names/shapes @openinary/ui's useQueueEvents hook expects, but sourced by
// polling Postgres for this tenant's jobs instead of subscribing to the
// container's in-memory EventEmitter (which the Worker has no access to).
export function queueEventsStream(tenantRoot: string): Response {
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
          const rows = await db
            .select()
            .from(videoJob)
            .where(like(videoJob.filePath, `${tenantPrefix}%`))
            .orderBy(desc(videoJob.createdAt))
            .limit(200);

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
                priority: 2,
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
