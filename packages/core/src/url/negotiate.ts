/** Browser support for a modern image format, Accept header first. */
export function supportsFormat(
  format: "avif" | "webp",
  userAgent?: string,
  acceptHeader?: string,
): boolean {
  if (acceptHeader) {
    const acceptLower = acceptHeader.toLowerCase();
    if (format === "avif" && acceptLower.includes("image/avif")) return true;
    if (format === "webp" && acceptLower.includes("image/webp")) return true;
  }
  // No user agent: assume a modern client that just didn't send Accept.
  if (!userAgent) return true;

  const ua = userAgent.toLowerCase();
  const version = (pattern: RegExp) =>
    Number.parseInt(ua.match(pattern)?.[1] || "0");
  if (format === "avif") {
    // Chrome 85, Firefox 93, Safari 16, Edge 122
    return (
      (ua.includes("chrome") && !ua.includes("edg") && version(/chrome\/(\d+)/) >= 85) ||
      (ua.includes("firefox") && version(/firefox\/(\d+)/) >= 93) ||
      (ua.includes("safari") && !ua.includes("chrome") && version(/version\/(\d+)/) >= 16) ||
      (ua.includes("edg") && version(/edg\/(\d+)/) >= 122)
    );
  }
  return (
    !ua.includes("msie") &&
    !ua.includes("trident") &&
    !(ua.includes("edge") && version(/edge\/(\d+)/) < 18)
  );
}

/**
 * The format an image request that named none (or f_auto) is encoded and
 * cached in for this client. The Worker computes the same answer to find the
 * cached derivative without waking the container.
 */
export function determineOptimalFormatForCache(
  userAgent?: string,
  acceptHeader?: string,
  originalFormat?: string,
): string {
  if (supportsFormat("avif", userAgent, acceptHeader)) return "avif";
  if (supportsFormat("webp", userAgent, acceptHeader)) return "webp";
  // Legacy browsers: keep PNG's transparency
  return originalFormat === "png" ? "png" : "jpeg";
}
