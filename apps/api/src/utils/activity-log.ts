// What one publicly served asset looks like in the dashboard's Usage page, the
// rules deciding whether a request is worth a line there, and the two facts
// the Get started checklist reads.
//
// Takes its database as an argument rather than importing shared/auth, which
// opens the real one on import: every rule below runs against an in-memory
// database in activity-log.test.ts.

import type { Database } from "better-sqlite3";

export type DeliveryKind = "image" | "video" | "other";

export type DeliveryEvent = {
  /** Epoch ms. */
  t: number;
  /** Everything after /t/, transformation segment included. */
  p: string;
  k: DeliveryKind;
  /** HTTP status actually returned to the caller. */
  s: number;
};

export const LOG_LIMIT = 500;

// Long enough for a real nested path with a transformation in front of it.
const PATH_MAX = 200;

const IMAGE_EXT = /\.(jpe?g|png|webp|avif|gif|heic|heif|svg|bmp|tiff?)$/i;
const VIDEO_EXT = /\.(mp4|mov|webm|mkv|avi|m4v)$/i;

export function deliveryKind(path: string): DeliveryKind {
  if (IMAGE_EXT.test(path)) return "image";
  if (VIDEO_EXT.test(path)) return "video";
  return "other";
}

/**
 * One playback is many HTTP hits: a <video> element pulls the file in byte
 * ranges and re-requests on seek and buffer. Only the opening request is a
 * delivery worth a line.
 */
export function isOpeningRange(range: string | undefined): boolean {
  return !range || range.startsWith("bytes=0-");
}

/**
 * How long after a viewer opens an asset a second opening of the same asset by
 * the same viewer is still the same delivery. A browser navigating straight to
 * a video URL fetches it once for the document and again for the <video>
 * inside it, a second or so apart.
 */
const DEDUPE_WINDOW_MS = 15_000;
const DEDUPE_MAX_KEYS = 2_000;

/**
 * Whether `key` was already counted inside the window, recording it if not.
 * A repeat does not refresh the timestamp: the window runs from the first
 * delivery.
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

/**
 * Whether this request is the dashboard showing an asset to its owner rather
 * than an asset served to the public. The dashboard and the API share a site,
 * so its requests carry the session cookie and a visitor's never do.
 *
 * Presence only, not validity: this decides what is worth logging, not what
 * anyone may access, and validating would cost a database read per image.
 */
export function isDashboardTraffic(cookie: string | undefined): boolean {
  return !!cookie && cookie.includes("better-auth.session_token=");
}

export class ActivityLog {
  #db: Database;
  #seen = new Map<string, number>();

  constructor(db: Database) {
    this.#db = db;
    db.exec(`
      CREATE TABLE IF NOT EXISTS delivery_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        t INTEGER NOT NULL,
        path TEXT NOT NULL,
        kind TEXT NOT NULL,
        status INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  /**
   * Records one delivery unless it is a repeat of one just recorded.
   * `viewer` tells visitors apart, so two people opening the same asset are
   * two lines.
   */
  // ponytail: one synchronous insert per public delivery. Batch behind a
  // timer if an instance ever serves enough traffic for that to show.
  recordDelivery(
    event: Omit<DeliveryEvent, "k" | "t"> & { t?: number },
    viewer: string,
  ): void {
    const t = event.t ?? Date.now();
    if (seenRecently(this.#seen, `${viewer}|${event.p}`, t)) return;

    const path = event.p.slice(0, PATH_MAX);
    const { lastInsertRowid } = this.#db
      .prepare(
        "INSERT INTO delivery_log (t, path, kind, status) VALUES (?, ?, ?, ?)",
      )
      .run(t, path, deliveryKind(path), event.s);
    this.#db
      .prepare("DELETE FROM delivery_log WHERE id <= ?")
      .run(Number(lastInsertRowid) - LOG_LIMIT);
  }

  /** Newest first. */
  deliveries(): DeliveryEvent[] {
    return this.#db
      .prepare(
        "SELECT t, path AS p, kind AS k, status AS s FROM delivery_log ORDER BY id DESC LIMIT ?",
      )
      .all(LOG_LIMIT) as DeliveryEvent[];
  }

  /** True once anything was served to the public with a 2xx. */
  hasDelivered(): boolean {
    return !!this.#db
      .prepare(
        "SELECT 1 FROM delivery_log WHERE status BETWEEN 200 AND 299 LIMIT 1",
      )
      .get();
  }

  /** An upload that came from an app (API key or signature), not from here. */
  markApiUpload(): void {
    this.#db
      .prepare(
        "INSERT OR IGNORE INTO app_state (key, value) VALUES ('api_upload_seen', '1')",
      )
      .run();
  }

  apiUploadSeen(): boolean {
    return !!this.#db
      .prepare("SELECT 1 FROM app_state WHERE key = 'api_upload_seen'")
      .get();
  }
}
