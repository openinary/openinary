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
 * Over localhost an upload of a few dozen KB completes before the progress bar
 * can render, so the whole queue would blink straight to "Uploaded" and the
 * uploading, cancel and per-file states would never be seen.
 *
 * The wait is derived from the request's own size rather than passed in, so it
 * needs no extra field in the protocol and stays plausible: a bigger file takes
 * longer, and files sent together finish at different moments. Capped so this
 * unauthenticated endpoint cannot be made to hold connections open.
 */
const SIMULATED_BYTES_PER_SECOND = 48 * 1024;
const BASE_LATENCY_MS = 450;
const MAX_DELAY_MS = 3000;

function simulatedTransferMs(bytes: number): number {
  const transfer = (bytes / SIMULATED_BYTES_PER_SECOND) * 1000;
  return Math.min(MAX_DELAY_MS, BASE_LATENCY_MS + transfer);
}

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

  // Drain without buffering: the browser needs to finish sending for the
  // progress bar to reach 100%, but we never hold the file in memory.
  let received = 0;
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
    }
  }

  await sleep(simulatedTransferMs(received));

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
