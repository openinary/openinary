// What counts as one delivery of an asset, shared by the self-hosted activity
// log and the Cloud's (where it is also what gets billed).

/**
 * One playback is many HTTP hits: a <video> element pulls the file in byte
 * ranges and re-requests on seek and buffer. Only the opening request is a
 * delivery.
 */
export function isOpeningRange(range: string | null | undefined): boolean {
  return !range || range.startsWith('bytes=0-');
}

/**
 * How long after a viewer opens an asset a second opening of the same asset by
 * the same viewer is still the same delivery. A browser navigating straight to
 * a video URL fetches it once for the document and again for the <video>
 * inside it, both with the opening range, a second or so apart; a media
 * element restarting after a stall does the same. 15s is well past those
 * re-opens and well short of a viewer deliberately replaying something.
 */
const DEDUPE_WINDOW_MS = 15_000;

// Bounds the in-memory key map if many distinct assets are served at once.
const DEDUPE_MAX_KEYS = 2_000;

/**
 * Whether `key` (viewer + asset) was already counted inside the window,
 * recording it if not. Mutates `seen`, which the caller keeps in memory only.
 * A repeat does not refresh the timestamp: the window runs from the first
 * delivery, so a client re-requesting forever still counts once per window.
 */
export function seenRecently(
  seen: Map<string, number>,
  key: string,
  now: number,
): boolean {
  const at = seen.get(key);
  if (at !== undefined && now - at < DEDUPE_WINDOW_MS) return true;
  seen.set(key, now);
  if (seen.size > DEDUPE_MAX_KEYS) {
    for (const [k, t] of seen) {
      if (now - t >= DEDUPE_WINDOW_MS) seen.delete(k);
    }
  }
  return false;
}
