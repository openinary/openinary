import path from "path";

/**
 * Single source of truth for what Openinary accepts at upload time.
 * Consumed by the OSS API and the SaaS so their whitelists cannot diverge.
 *
 * Deliberately excludes svg (stored-XSS vector when served inline) and every
 * format the transform pipeline cannot decode.
 */
export const ALLOWED_UPLOAD_TYPES: Readonly<Record<string, readonly string[]>> =
  {
    // Images
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/webp": [".webp"],
    "image/avif": [".avif"],
    "image/gif": [".gif"],
    "image/heic": [".heic", ".heif"],
    "image/heif": [".heic", ".heif"],
    "image/vnd.adobe.photoshop": [".psd"],
    "application/octet-stream": [".psd"],
    // Videos
    "video/mp4": [".mp4"],
    "video/quicktime": [".mov"],
    "video/webm": [".webm"],
  };

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
