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
  /**
   * Does the file body actually look like this type? Filename and MIME are both
   * client-controlled, so this is the only check an attacker cannot simply set.
   */
  matches: (head: Buffer) => boolean;
}

/** ASCII marker at a fixed offset, e.g. "RIFF" at 0 or "ftyp" at 4. */
const marker = (head: Buffer, offset: number, text: string): boolean =>
  head.length >= offset + text.length &&
  head.toString("latin1", offset, offset + text.length) === text;

/**
 * ISO base media file format (mp4, mov, avif, heic): a box header at offset 4.
 *
 * Usually `ftyp`, but that box postdates QuickTime, so a .mov written by an
 * older camera or encoder can legitimately open on `wide`, `moov`, `mdat`,
 * `free`, `skip` or `pnot` instead - checking for `ftyp` alone rejects files
 * that upload fine today. The brand after `ftyp` is not pinned either: it
 * varies widely (isom, iso5, qt, mp42, avc1, heix, ...). Any of these box
 * types is enough to rule out markup and scripts, which is what this is for.
 */
const BMFF_BOXES = ["ftyp", "moov", "mdat", "free", "skip", "wide", "pnot"];
const isoBmff = (head: Buffer): boolean =>
  BMFF_BOXES.some((box) => marker(head, 4, box));

/** RIFF container with a specific form type, e.g. WEBP or WAVE. */
const riff = (head: Buffer, form: string): boolean =>
  marker(head, 0, "RIFF") && marker(head, 8, form);

/**
 * A text format we only need to tell apart from markup and binaries: the first
 * meaningful character must open a JSON object. Deliberately not a full parse -
 * that would mean reading whole files to reject `<script>`.
 */
const jsonObject = (head: Buffer): boolean => {
  let text = head.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  return text.trimStart().startsWith("{");
};

const MEDIA_TYPES: readonly MediaType[] = [
  // Images
  { ext: "jpg", aliases: ["jpeg"], contentType: "image/jpeg", uploadMimes: ["image/jpeg"],
    matches: (h) => h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff },
  { ext: "png", contentType: "image/png", uploadMimes: ["image/png"],
    matches: (h) => marker(h, 0, "\x89PNG\r\n\x1a\n") },
  { ext: "webp", contentType: "image/webp", uploadMimes: ["image/webp"],
    matches: (h) => riff(h, "WEBP") },
  { ext: "avif", contentType: "image/avif", uploadMimes: ["image/avif"],
    matches: isoBmff },
  { ext: "gif", contentType: "image/gif", uploadMimes: ["image/gif"],
    matches: (h) => marker(h, 0, "GIF87a") || marker(h, 0, "GIF89a") },
  { ext: "heic", aliases: ["heif"], contentType: "image/heic",
    uploadMimes: ["image/heic", "image/heif"],
    matches: isoBmff },
  { ext: "psd", contentType: "image/vnd.adobe.photoshop",
    uploadMimes: ["image/vnd.adobe.photoshop", "application/octet-stream"],
    matches: (h) => marker(h, 0, "8BPS") },
  // Videos
  { ext: "mp4", contentType: "video/mp4", uploadMimes: ["video/mp4"],
    matches: isoBmff },
  { ext: "mov", contentType: "video/quicktime", uploadMimes: ["video/quicktime"],
    matches: isoBmff },
  { ext: "webm", contentType: "video/webm", uploadMimes: ["video/webm"],
    // EBML header, shared with mkv
    matches: (h) => h[0] === 0x1a && h[1] === 0x45 && h[2] === 0xdf && h[3] === 0xa3 },
  // Audio (stored + delivered as originals, not transformed)
  { ext: "wav", contentType: "audio/wav", uploadMimes: ["audio/wav", "audio/x-wav"],
    matches: (h) => riff(h, "WAVE") },
  { ext: "mp3", contentType: "audio/mpeg", uploadMimes: ["audio/mpeg"],
    // Either an ID3 tag or a bare MPEG frame sync (11 set bits)
    matches: (h) =>
      marker(h, 0, "ID3") || (h[0] === 0xff && (h[1] & 0xe0) === 0xe0) },
  { ext: "ogg", contentType: "audio/ogg", uploadMimes: ["audio/ogg", "application/ogg"],
    matches: (h) => marker(h, 0, "OggS") },
  // 3D models (stored + delivered as originals). Browsers usually send .glb as
  // application/octet-stream, the same as .psd - the content check below is what
  // keeps that generic MIME from being a way in for arbitrary binaries.
  { ext: "glb", contentType: "model/gltf-binary",
    uploadMimes: ["model/gltf-binary", "application/octet-stream"],
    matches: (h) => marker(h, 0, "glTF") },
  { ext: "gltf", contentType: "model/gltf+json",
    uploadMimes: ["model/gltf+json", "application/octet-stream"],
    matches: jsonObject },
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
 *
 * Both inputs come from the client, so this rejects honest mistakes rather than
 * attacks - pair it with validateUploadContent, which reads the bytes.
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

const TYPE_BY_EXT: ReadonlyMap<string, MediaType> = new Map(
  MEDIA_TYPES.flatMap((t) =>
    [t.ext, ...(t.aliases ?? [])].map((e) => [e, t] as const),
  ),
);

/**
 * Checks the file's own bytes against the type its name claims.
 *
 * The MIME type and the extension are both set by whoever is uploading, so on
 * their own they stop a mistake, not an attacker: anything can be named
 * `.glb` and sent as `application/octet-stream`. Stored originals (audio, 3D)
 * are served back untouched, so nothing downstream would notice the mismatch -
 * images and videos only get caught today because the transform pipeline
 * re-encodes them.
 *
 * Signatures live on the same table as the whitelist so a new type cannot be
 * accepted without one. Returns true for an extension we have no signature
 * for, so this can never be the thing that blocks a type the whitelist allows.
 */
export function validateUploadContent(
  filename: string,
  content: Buffer,
): boolean {
  const ext = path.extname(filename).toLowerCase().replace(/^\./, "");
  const type = TYPE_BY_EXT.get(ext);
  if (!type) {
    return true; // unknown extension: validateUploadFileType already rejected it
  }
  // 64 bytes covers every signature above; JSON detection needs a little slack
  // for leading whitespace.
  return type.matches(content.subarray(0, 64));
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
