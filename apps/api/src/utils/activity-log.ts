// What one publicly served asset looks like in the dashboard's Logs page, the
// rules deciding whether a request is worth a line there, the hourly counts
// its chart reads, and the two facts the Get started checklist reads.
//
// Takes its database as an argument rather than importing shared/auth, which
// opens the real one on import: every rule below runs against a test database
// in activity-log.test.ts.

import type { PrismaClient } from "shared/db";

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
  #db: PrismaClient;
  #seen = new Map<string, number>();
  #prunedHour = 0;

  /**
   * Stores nothing at construction: `db` may be the lazy Proxy from
   * shared/auth, which throws until initDb() has run. The tables are created
   * by migration 20261004120000_activity_log, not by runtime DDL — and there
   * is no sqlite-era backfill of delivery_counts from old log rows, because
   * this repo has never stored them in sqlite.
   */
  constructor(db: PrismaClient) {
    this.#db = db;
  }

  /**
   * Records one delivery unless it is a repeat of one just recorded: a line
   * in the log and one more in its hour's count. `viewer` tells visitors
   * apart, so two people opening the same asset are two lines.
   */
  // ponytail: one transaction per public delivery. Batch the counts in
  // memory behind a timer if an instance ever serves enough traffic for that
  // to show.
  async recordDelivery(
    event: Omit<DeliveryEvent, "k" | "t"> & { t?: number },
    viewer: string,
  ): Promise<void> {
    const t = event.t ?? Date.now();
    if (seenRecently(this.#seen, `${viewer}|${event.p}`, t)) return;

    const path = event.p.slice(0, PATH_MAX);
    const kind = deliveryKind(path);
    const hour = Math.floor(t / HOUR_MS) * HOUR_MS;
    const failed = event.s >= 400;

    await this.#db.$transaction(async (tx) => {
      const { id } = await tx.deliveryLog.create({
        data: { t: new Date(t), path, kind, status: event.s },
        select: { id: true },
      });
      await tx.deliveryLog.deleteMany({ where: { id: { lte: id - LOG_LIMIT } } });
      await tx.deliveryCount.upsert({
        where: { hour_kind: { hour: new Date(hour), kind } },
        create: { hour: new Date(hour), kind, delivered: failed ? 0 : 1, failed: failed ? 1 : 0 },
        update: failed ? { failed: { increment: 1 } } : { delivered: { increment: 1 } },
      });
      // Once per hour is plenty to keep the table at a year.
      if (hour !== this.#prunedHour) {
        this.#prunedHour = hour;
        await tx.deliveryCount.deleteMany({
          where: { hour: { lt: new Date(hour - COUNTS_RETENTION_MS) } },
        });
      }
    });
  }

  /** Hourly counts from `since` (epoch ms) on, oldest first. */
  async counts(since: number): Promise<DeliveryCount[]> {
    const rows = await this.#db.deliveryCount.findMany({
      where: { hour: { gte: new Date(Math.floor(since / HOUR_MS) * HOUR_MS) } },
      orderBy: { hour: "asc" },
    });
    return rows.map((r) => ({
      t: r.hour.getTime(),
      k: r.kind as DeliveryKind,
      d: r.delivered,
      f: r.failed,
    }));
  }

  /** Newest first. */
  async deliveries(): Promise<DeliveryEvent[]> {
    const rows = await this.#db.deliveryLog.findMany({
      orderBy: { id: "desc" },
      take: LOG_LIMIT,
    });
    return rows.map((r) => ({
      t: r.t.getTime(),
      p: r.path,
      k: r.kind as DeliveryKind,
      s: r.status,
    }));
  }

  /** True once anything was served to the public with a 2xx. */
  async hasDelivered(): Promise<boolean> {
    const found = await this.#db.deliveryLog.findFirst({
      where: { status: { gte: 200, lte: 299 } },
      select: { id: true },
    });
    return !!found;
  }

  /** An upload that came from an app (API key or signature), not from here. */
  async markApiUpload(): Promise<void> {
    await this.#db.appState.upsert({
      where: { key: "api_upload_seen" },
      create: { key: "api_upload_seen", value: "1" },
      update: {},
    });
  }

  async apiUploadSeen(): Promise<boolean> {
    const row = await this.#db.appState.findUnique({ where: { key: "api_upload_seen" } });
    return !!row;
  }

  /**
   * When `key` was first asked for: stored on the first call, read back on
   * every one after, across restarts.
   */
  async since(key: string, now = Date.now()): Promise<number> {
    await this.#db.appState.upsert({
      where: { key },
      create: { key, value: JSON.stringify(now) },
      update: {},
    });
    return (await this.getState<number>(key)) ?? now;
  }

  /** A JSON document kept in app_state, e.g. onboarding answers. */
  async getState<T>(key: string): Promise<T | undefined> {
    const row = await this.#db.appState.findUnique({ where: { key } });
    return row ? (JSON.parse(row.value) as T) : undefined;
  }

  async setState(key: string, value: unknown): Promise<void> {
    await this.#db.appState.upsert({
      where: { key },
      create: { key, value: JSON.stringify(value) },
      update: { value: JSON.stringify(value) },
    });
  }
}
