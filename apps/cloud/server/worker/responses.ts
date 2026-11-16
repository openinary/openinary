// Serving an R2 object, whole or in part. Shared by the CDN, /download and the
// admin file browser, which must agree on what "bytes=" means and on the
// Content-Length/Content-Range they send: a Content-Length that disagrees with
// the bytes actually sent hangs the player mid-stream. Also the plain-text
// error shape the CDN answers with.

type ByteRange = { offset: number; length: number };

/**
 * bytes=start-end / bytes=start- / bytes=-suffix, clamped to the object's
 * real size. Null for anything absent, malformed, multi-range or
 * unsatisfiable; callers either serve the whole file or answer 416.
 */
export function parseRangeHeader(
  header: string | null,
  totalSize: number,
): ByteRange | null {
  if (!header) return null;
  const match = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  const [, startStr, endStr] = match;
  if (startStr === "" && endStr === "") return null;
  let offset: number;
  let end: number;
  if (startStr === "") {
    offset = Math.max(0, totalSize - Number(endStr));
    end = totalSize - 1;
  } else {
    offset = Number(startStr);
    end =
      endStr === "" ? totalSize - 1 : Math.min(Number(endStr), totalSize - 1);
  }
  if (
    !Number.isFinite(offset) ||
    !Number.isFinite(end) ||
    offset < 0 ||
    offset > end
  )
    return null;
  return { offset, length: end - offset + 1 };
}

/**
 * The range R2 actually served when it was handed the request's headers.
 * R2Range is a union (offset-only, length-only and suffix forms all exist), so
 * both ends are resolved against the object size rather than assumed present.
 */
export function servedRange(object: R2ObjectBody): ByteRange | null {
  const range = object.range;
  if (!range) return null;
  const offset =
    "offset" in range && range.offset !== undefined
      ? range.offset
      : object.size - ("suffix" in range ? range.suffix : 0);
  const length =
    "length" in range && range.length !== undefined
      ? range.length
      : object.size - offset;
  return { offset, length };
}

/** 206 with Content-Range when `range` is set, otherwise 200 with the whole body. */
export function objectResponse(
  object: R2ObjectBody,
  headers: Headers,
  range: ByteRange | null,
): Response {
  if (range) {
    headers.set("Content-Length", String(range.length));
    headers.set(
      "Content-Range",
      `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`,
    );
    return new Response(object.body, { status: 206, headers });
  }
  headers.set("Content-Length", String(object.size));
  return new Response(object.body, { headers });
}

/** Read by cross-origin players to know how much they got and how much is left. */
export const RANGE_EXPOSE_HEADERS = "Content-Length, Content-Range, Accept-Ranges";

/** An uncacheable plain-text answer any origin can read: the CDN's errors. */
export const textResponse = (status: number, body: string) =>
  new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
