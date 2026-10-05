// What one publicly served asset looks like in the dashboard's Logs page, the
// rules deciding whether a request is worth a line there, the hourly counts
// its chart reads, and the two facts the Get started checklist reads.
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

/** One hour of deliveries of one kind. Wire format, like DeliveryEvent. */
export type DeliveryCount = {
  /** Epoch ms at the start of the hour. */
  t: number;
  k: DeliveryKind;
  /** Delivered (status under 400). */
  d: number;
  /** Failed (400 and up), same split as the dashboard's. */
  f: number;
};

export const LOG_LIMIT = 500;

const HOUR_MS = 3_600_000;
// The log keeps lines for the table; the counts keep the chart honest past
// them, at one row per hour and kind whatever the traffic.
const COUNTS_RETENTION_MS = 365 * 24 * HOUR_MS;

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
  #prunedHour = 0;

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
      CREATE TABLE IF NOT EXISTS delivery_counts (
        hour INTEGER NOT NULL,
        kind TEXT NOT NULL,
        delivered INTEGER NOT NULL,
        failed INTEGER NOT NULL,
        PRIMARY KEY (hour, kind)
      );
    `);
    // An instance upgrading to counts starts them from the lines it already
    // holds, so its chart doesn't open empty.
    if (!db.prepare("SELECT 1 FROM delivery_counts LIMIT 1").get()) {
      db.exec(`
        INSERT INTO delivery_counts (hour, kind, delivered, failed)
        SELECT (t / ${HOUR_MS}) * ${HOUR_MS}, kind,
               SUM(status < 400), SUM(status >= 400)
        FROM delivery_log GROUP BY 1, 2
      `);
    }
  }

  /**
   * Records one delivery unless it is a repeat of one just recorded: a line
   * in the log and one more in its hour's count. `viewer` tells visitors
   * apart, so two people opening the same asset are two lines.
   */
  // ponytail: one synchronous transaction per public delivery. Batch the
  // counts in memory behind a timer if an instance ever serves enough traffic
  // for that to show.
  recordDelivery(
    event: Omit<DeliveryEvent, "k" | "t"> & { t?: number },
    viewer: string,
  ): void {
    const t = event.t ?? Date.now();
    if (seenRecently(this.#seen, `${viewer}|${event.p}`, t)) return;

    const path = event.p.slice(0, PATH_MAX);
    const kind = deliveryKind(path);
    const hour = Math.floor(t / HOUR_MS) * HOUR_MS;
    const failed = event.s >= 400 ? 1 : 0;

    this.#db.transaction(() => {
      const { lastInsertRowid } = this.#db
        .prepare(
          "INSERT INTO delivery_log (t, path, kind, status) VALUES (?, ?, ?, ?)",
        )
        .run(t, path, kind, event.s);
      this.#db
        .prepare("DELETE FROM delivery_log WHERE id <= ?")
        .run(Number(lastInsertRowid) - LOG_LIMIT);
      this.#db
        .prepare(
          `INSERT INTO delivery_counts (hour, kind, delivered, failed) VALUES (?, ?, ?, ?)
           ON CONFLICT(hour, kind) DO UPDATE SET
             delivered = delivered + excluded.delivered,
             failed = failed + excluded.failed`,
        )
        .run(hour, kind, 1 - failed, failed);
      // Once per hour is plenty to keep the table at a year.
      if (hour !== this.#prunedHour) {
        this.#prunedHour = hour;
        this.#db
          .prepare("DELETE FROM delivery_counts WHERE hour < ?")
          .run(hour - COUNTS_RETENTION_MS);
      }
    })();
  }

  /** Hourly counts from `since` (epoch ms) on, oldest first. */
  counts(since: number): DeliveryCount[] {
    return this.#db
      .prepare(
        "SELECT hour AS t, kind AS k, delivered AS d, failed AS f FROM delivery_counts WHERE hour >= ? ORDER BY hour",
      )
      .all(Math.floor(since / HOUR_MS) * HOUR_MS) as DeliveryCount[];
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

  /**
   * When `key` was first asked for: stored on the first call, read back on
   * every one after, across restarts.
   */
  since(key: string, now = Date.now()): number {
    this.#db
      .prepare("INSERT OR IGNORE INTO app_state (key, value) VALUES (?, ?)")
      .run(key, JSON.stringify(now));
    return this.getState<number>(key) ?? now;
  }

  /** A JSON document kept in app_state, e.g. onboarding answers. */
  getState<T>(key: string): T | undefined {
    const row = this.#db
      .prepare("SELECT value FROM app_state WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as T) : undefined;
  }

  setState(key: string, value: unknown): void {
    this.#db
      .prepare(
        "INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(key, JSON.stringify(value));
  }
}
