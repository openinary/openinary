// What one publicly served asset looks like in the dashboard's Logs page, the
// rules deciding whether a request is worth a line there, the hourly counts
// its chart reads, and the two facts the Get started checklist reads.

import {
  extOf,
  isTransformableImageExt,
  isVideoExt,
  seenRecently,
} from "@openinary/core/url";
import { type Db, kvGet, kvInit } from "shared";

// Shared with the Cloud, which bills on the same rules.
export { isOpeningRange, seenRecently } from "@openinary/core/url";

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

/** Same split as the Cloud's: what the transform pipeline handles as each. */
export function deliveryKind(path: string): DeliveryKind {
  const ext = extOf(path);
  if (isTransformableImageExt(ext)) return "image";
  if (isVideoExt(ext)) return "video";
  return "other";
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
  #db: Db;
  #seen = new Map<string, number>();
  #prunedHour = 0;

  /** `db` must already be migrated, as shared's openDb leaves it. */
  constructor(db: Db) {
    this.#db = db;
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
    kvInit(this.#db, "api_upload_seen", "1");
  }

  apiUploadSeen(): boolean {
    return kvGet(this.#db, "api_upload_seen") !== undefined;
  }
}
