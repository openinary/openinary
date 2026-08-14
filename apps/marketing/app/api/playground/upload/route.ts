/**
 * Upload sink for the homepage playground.
 *
 * The playground renders the real `FileUploader` from the registry, so its
 * upload path has to be a real HTTP request: that is what drives the progress
 * bar, cancel and retry. This endpoint speaks the shape the uploader expects
 * and then drops the bytes on the floor. Nothing is stored, nothing is
 * forwarded, and no Openinary instance is involved.
 *
 * It is deliberately unauthenticated, so it must stay a sink: never write the
 * body anywhere, and keep the size cap below so it cannot be used as a
 * bandwidth pump.
 */

/** Anything over this is rejected, which also demos the uploader error state. */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Simulated link speed. Over localhost the real thing is instant, and the
 * uploader's progress bar is driven by bytes *sent*, so it would jump to 100%
 * and then sit there while the server thought about it, which reads as a stall
 * rather than an upload.
 *
 * Slowing the reads instead of sleeping at the end makes the bar honest: once
 * the socket buffers fill, the browser can only send as fast as this end
 * drains, so progress advances at roughly this rate.
 */
const TARGET_UPLOAD_MS = 1800;

/**
 * The browser hands roughly this much to the socket before back-pressure makes
 * it wait on us, so it reports 100% sent while we still have that much left to
 * read. Pacing the tail as well would park the bar at 100% for the difference,
 * which is the stall we are trying to avoid, so the last stretch is drained as
 * fast as it arrives.
 */
const UNPACED_TAIL_BYTES = 1_500_000;

/** Backstop, so an unauthenticated endpoint cannot be held open indefinitely. */
const MAX_DURATION_MS = 15_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) {
    return json(
      { success: false, error: "File exceeds the 10MB playground limit" },
      413,
    );
  }

  // Drain without buffering, pacing the reads so the sender is throttled to
  // SIMULATED_BYTES_PER_SECOND. Nothing is kept: each chunk is counted and
  // dropped.
  let received = 0;
  const startedAt = Date.now();
  const pacedBytes = Math.max(0, declared - UNPACED_TAIL_BYTES);
  const reader = request.body?.getReader();

  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      received += value.byteLength;
      if (received > MAX_BYTES) {
        await reader.cancel();
        return json(
          { success: false, error: "File exceeds the 10MB playground limit" },
          413,
        );
      }

      const elapsed = Date.now() - startedAt;
      if (elapsed > MAX_DURATION_MS) break;

      if (received < pacedBytes) {
        const owed = (received / pacedBytes) * TARGET_UPLOAD_MS - elapsed;
        if (owed > 0) await sleep(Math.min(owed, 200));
      }
    }
  }

  // A file small enough to sit entirely in the socket buffer is never throttled,
  // so nothing paced it: give it a brief pause rather than blinking to done.
  if (pacedBytes === 0) await sleep(700);

  return json(
    {
      success: true,
      files: [
        {
          filename: "playground",
          path: "playground/demo",
          size: received,
          // Not a real asset: the playground never renders this back.
          url: "/t/playground/demo",
        },
      ],
    },
    200,
  );
}
