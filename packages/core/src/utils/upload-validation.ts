import path from "path";

/**
 * Single source of truth for the media types Openinary handles: what it accepts
 * at upload time AND the content-type each one is served with. The upload
 * whitelist and the extension->content-type map are derived from one table so
 * they cannot drift.
 *
 * Consumed by the OSS API and the SaaS so their whitelists cannot diverge.
 * Deliberately excludes svg (stored-XSS vector when served inline). Images and
 * videos go through the transform pipeline; audio and 3D are stored and served
 * as opaque originals (no transform pipeline).
 */
interface MediaType {
  /** canonical extension, no dot, lowercase */
  ext: string;
  /** extra extensions that resolve to the same type (e.g. jpeg -> jpg) */
  aliases?: readonly string[];
  /** content-type used when serving the stored original */
  contentType: string;
  /** MIME values a browser may send for this type at upload (includes contentType) */
  uploadMimes: readonly string[];
}

const MEDIA_TYPES: readonly MediaType[] = [
  // Images
  { ext: "jpg", aliases: ["jpeg"], contentType: "image/jpeg", uploadMimes: ["image/jpeg"] },
  { ext: "png", contentType: "image/png", uploadMimes: ["image/png"] },
  { ext: "webp", contentType: "image/webp", uploadMimes: ["image/webp"] },
  { ext: "avif", contentType: "image/avif", uploadMimes: ["image/avif"] },
  { ext: "gif", contentType: "image/gif", uploadMimes: ["image/gif"] },
  { ext: "heic", aliases: ["heif"], contentType: "image/heic",
    uploadMimes: ["image/heic", "image/heif"] },
  { ext: "psd", contentType: "image/vnd.adobe.photoshop",
    uploadMimes: ["image/vnd.adobe.photoshop", "application/octet-stream"] },
  // Videos
  { ext: "mp4", contentType: "video/mp4", uploadMimes: ["video/mp4"] },
  { ext: "mov", contentType: "video/quicktime", uploadMimes: ["video/quicktime"] },
  { ext: "webm", contentType: "video/webm", uploadMimes: ["video/webm"] },
  // Audio (stored + delivered as originals, not transformed)
  { ext: "wav", contentType: "audio/wav", uploadMimes: ["audio/wav", "audio/x-wav"] },
  { ext: "mp3", contentType: "audio/mpeg", uploadMimes: ["audio/mpeg"] },
  { ext: "ogg", contentType: "audio/ogg", uploadMimes: ["audio/ogg", "application/ogg"] },
  // 3D models (stored + delivered as originals). Browsers usually send .glb as
  // application/octet-stream, the same as .psd.
  { ext: "glb", contentType: "model/gltf-binary",
    uploadMimes: ["model/gltf-binary", "application/octet-stream"] },
  { ext: "gltf", contentType: "model/gltf+json",
    uploadMimes: ["model/gltf+json", "application/octet-stream"] },
];

const CONTENT_TYPE_BY_EXT: Readonly<Record<string, string>> = Object.fromEntries(
  MEDIA_TYPES.flatMap((t) =>
    [t.ext, ...(t.aliases ?? [])].map((e) => [e, t.contentType] as const),
  ),
);

/**
 * Upload whitelist derived from the table above: MIME type -> allowed extensions.
 */
export const ALLOWED_UPLOAD_TYPES: Readonly<Record<string, readonly string[]>> =
  (() => {
    const out: Record<string, string[]> = {};
    for (const t of MEDIA_TYPES) {
      const exts = [t.ext, ...(t.aliases ?? [])].map((e) => `.${e}`);
      for (const mime of t.uploadMimes) {
        out[mime] = [...new Set([...(out[mime] ?? []), ...exts])];
      }
    }
    return out;
  })();

/**
 * Content-type to serve a stored original with, keyed by file extension. Falls
 * back to application/octet-stream for anything unknown (never a guessed type).
 */
export function contentTypeForExt(ext: string | undefined): string {
  return (
    (ext && CONTENT_TYPE_BY_EXT[ext.toLowerCase()]) || "application/octet-stream"
  );
}

/**
 * The distinct file extensions accepted at upload, for user-facing error
 * messages. Derived from the same table so it can never list a stale set.
 */
export function allowedUploadExtensions(): string[] {
  return [
    ...new Set(MEDIA_TYPES.flatMap((t) => [t.ext, ...(t.aliases ?? [])])),
  ].sort();
}

/**
 * Validates an upload's file type: the MIME type must be allowed and the
 * filename extension must match that MIME type.
 */
export function validateUploadFileType(
  filename: string,
  mimeType: string,
): boolean {
  const allowedExtensions = ALLOWED_UPLOAD_TYPES[mimeType];
  if (!allowedExtensions) {
    return false;
  }
  return allowedExtensions.includes(path.extname(filename).toLowerCase());
}

/**
 * Characters that make a storage key unaddressable once it is part of a URL.
 *
 * Every asset is fetched through a URL built from its key, so a key holding
 * one of these can never be delivered, however careful the client is:
 *
 * - `#` starts a fragment. The browser strips it and everything after it
 *   before the request leaves, so `The #1 clip.mp4` is requested as `The `
 *   and 404s on a file that is sitting right there.
 * - `?` does the same as a query string.
 * - `%` survives the round trip as a *different* key: readers decode, so
 *   `50%20off.mp4` is looked up as `50 off.mp4`.
 * - Control characters end up in the `Content-Disposition` and
 *   `x-original-path` headers written from the key.
 *
 * Spaces and accents are deliberately kept - those encode and decode cleanly.
 */
const URL_HOSTILE_CHARS =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: that is the point
  /[#?%\u0000-\u001f]/g;

/**
 * Strips the characters above from a name or path on its way into storage.
 *
 * Applied at write time rather than encoded at read time on purpose: the
 * readers are the dashboard, the SDKs and whatever URL a user hand-writes
 * into their own `<img>` or `<video>`, and only the write side is ours to
 * fix. Slashes pass through, so this is safe on a full path as well as on a
 * single filename.
 */
export function stripUrlHostile(value: string): string {
  return value.replace(URL_HOSTILE_CHARS, "");
}
