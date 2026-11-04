import { createHash } from "crypto";

/**
 * Content type of an encoded image, read from its magic bytes.
 *
 * A cached derivative is the only thing that knows what it is: the URL keeps
 * the source extension (/t/w_1200/photo.jpg can hold AVIF or WebP after
 * format negotiation), so labelling from the path served AVIF as image/jpeg.
 */
export function sniffImageContentType(buffer: Buffer): string | undefined {
  if (buffer.length < 12) return undefined;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  const head6 = buffer.subarray(0, 6).toString("latin1");
  if (head6 === "GIF87a" || head6 === "GIF89a") return "image/gif";
  if (buffer.subarray(0, 4).toString("latin1") === "RIFF" && buffer.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (buffer.subarray(4, 8).toString("latin1") === "ftyp") {
    const brand = buffer.subarray(8, 12).toString("latin1");
    if (brand === "avif" || brand === "avis") return "image/avif";
    if (brand === "heic" || brand === "heix" || brand === "mif1") return "image/heic";
  }
  return undefined;
}

/**
 * Strong ETag for a delivered derivative: a hash of the bytes themselves.
 *
 * The fresh and the cached response send the same body, so they now send the
 * same tag (they used to build it from different strings), and any change to
 * the output changes it. A hex digest is a valid entity-tag, unlike the raw
 * params JSON whose double quotes broke the quoted-string (RFC 9110 8.8.3).
 */
export function derivativeEtag(buffer: Buffer): string {
  return `"${createHash("sha256").update(buffer).digest("hex").slice(0, 32)}"`;
}
