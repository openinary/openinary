import type { Context } from "hono";
import type { TransformOutcome, TransformResult } from "../services/transform.service";
import { contentTypeForExt } from "../url/media-types";
import { HTTPException } from "hono/http-exception";
import { decodeRequestPath } from "../url/grammar";
import { cleanStorageKey } from "../url/storage-layout";

/**
 * The decoded request path below the route's wildcard, whatever the app
 * mounted it under: "w_100/a.jpg" for "/t/w_100/a.jpg" on "/t/*", and for
 * "/b/x/t/w_100/a.jpg" on "/b/:id/t/*".
 *
 * Answers 400 for a path that could leave its root: Hono only decodeURI's,
 * so "..%2F" survives routing and becomes "../" here.
 */
export function pathBelowMount(c: Context): string {
  const depth = c.req.routePath.split("/").indexOf("*");
  const rest = decodeRequestPath(c.req.path).split("/").slice(depth).join("/");
  if (cleanStorageKey(rest) === null) throw new HTTPException(400, { message: "Invalid path" });
  return rest;
}

const OUTCOME_KEY = "openinary.transformOutcome";

/**
 * How the transform route served this request, for middleware that runs after
 * it (metrics). Undefined when the route failed before a result, or for any
 * route that does not go through respond().
 */
export function transformOutcome(c: Context): TransformOutcome | undefined {
  return c.get(OUTCOME_KEY);
}

/** The HTTP response of a transform result, shared by /t and /authenticated. */
export function respond(c: Context, result: TransformResult, filePath: string): Response {
  if (result.outcome) c.set(OUTCOME_KEY, result.outcome);
  // Content-Length is dropped for a buffered body and kept for a streamed
  // one, because @hono/node-server only writes its own when it can measure
  // the body:
  //
  //   buffer + our header  -> "content-length" AND "Content-Length", twice
  //   buffer, no header    -> Content-Length, correct
  //   stream + our header  -> Content-Length, correct, no duplicate
  //   stream, no header    -> Transfer-Encoding: chunked, length lost
  //
  // Two Content-Lengths is a framing error (RFC 9110 8.6): undici rejects
  // the response outright, and a caller proxying this instance over fetch
  // can be left awaiting one that never settles, with no status to report.
  for (const [key, value] of Object.entries(result.headers)) {
    if (key.toLowerCase() === "content-length" && !result.stream) continue;
    c.header(key, value);
  }

  // A stored original is served back untouched, so a file whose bytes are
  // markup must not be allowed to become HTML in the browser: without this
  // it would run as a page on our own origin. The header costs nothing on
  // the re-encoded responses, so no delivery path is left uncovered.
  c.header("X-Content-Type-Options", "nosniff");

  const status = (result.status ?? 200) as 200;
  if (result.contentType === "text/plain" && result.buffer) {
    return c.text(result.buffer.toString(), status);
  }
  // The shared media table, so an extension is never labelled differently
  // here from how it was labelled at upload.
  c.header("Content-Type", result.contentType || contentTypeForExt(filePath.split(".").pop()));
  return result.stream
    ? c.body(result.stream, status)
    : c.body(new Uint8Array(result.buffer!), status);
}

/**
 * A URL to read the original from instead of this instance's own storage, for
 * deployments where a hosted control plane hands this instance a short-lived
 * signed URL for one object rather than the user's storage credentials.
 *
 * Ignored unless allowed, and that gate is a security boundary: /t/* is
 * public, so honouring an arbitrary URL out of a request header would make any
 * reachable instance a fetch proxy for whatever it can address.
 */
export function remoteSourceUrl(c: Context, allowRemoteSource: boolean): string | undefined {
  if (!allowRemoteSource) return undefined;
  const url = c.req.header("x-openinary-source-url");
  if (!url) return undefined;
  try {
    // https only - the URL carries its own authorization in the query string.
    if (new URL(url).protocol !== "https:") return undefined;
  } catch {
    return undefined;
  }
  return url;
}
