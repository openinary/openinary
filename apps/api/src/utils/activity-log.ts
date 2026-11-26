// What one publicly served asset looks like in the dashboard's Logs page, the
// rules deciding whether a request is worth a line there, the hourly counts
// its chart reads, and the two facts the Get started checklist reads.

import {
  extOf,
  isTransformableImageExt,
  isVideoExt,
  seenRecently,
} from "@openinary/core/url";
import { type Database, kvGet, kvInit, sql } from "shared";

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
  readonly #resolveDb: () => Promise<Database>;
  #seen = new Map<string, number>();
  #prunedHour = 0;

  /**
   * `db` is a migrated database (as openDatabase leaves it), or a function
   * returning one (shared's getDatabase), so the log can be built at import
   * time before the database is open.
   */
  constructor(db: Database | (() => Promise<Database>)) {
    this.#resolveDb = typeof db === "function" ? db : () => Promise.resolve(db);
  }

  /**
   * Records one delivery unless it is a repeat of one just recorded: a line
   * in the log and one more in its hour's count. `viewer` tells visitors
   * apart, so two people opening the same asset are two lines. Resolves once
   * written; callers serving an image don't wait for it (see logDelivery).
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
    const failed = event.s >= 400 ? 1 : 0;
    // Once per hour is plenty to keep the counts at a year.
    const prune = hour !== this.#prunedHour;
    if (prune) this.#prunedHour = hour;

    const db = await this.#resolveDb();
    await db.transaction().execute(async (trx) => {
      const { id } = await trx
        .insertInto("delivery_log")
        .values({ t, path, kind, status: event.s })
        .returning("id")
        .executeTakeFirstOrThrow();
      await trx
        .deleteFrom("delivery_log")
        .where("id", "<=", Number(id) - LOG_LIMIT)
        .execute();
      await trx
        .insertInto("delivery_counts")
        .values({ hour, kind, delivered: 1 - failed, failed })
        .onConflict((oc) =>
          oc.columns(["hour", "kind"]).doUpdateSet((eb) => ({
            delivered: eb("delivery_counts.delivered", "+", eb.ref("excluded.delivered")),
            failed: eb("delivery_counts.failed", "+", eb.ref("excluded.failed")),
          })),
        )
        .execute();
      if (prune) {
        await trx
          .deleteFrom("delivery_counts")
          .where("hour", "<", hour - COUNTS_RETENTION_MS)
          .execute();
      }
    });
  }

  /** Hourly counts from `since` (epoch ms) on, oldest first. */
  async counts(since: number): Promise<DeliveryCount[]> {
    const db = await this.#resolveDb();
    const rows = await db
      .selectFrom("delivery_counts")
      .select(["hour as t", "kind as k", "delivered as d", "failed as f"])
      .where("hour", ">=", Math.floor(since / HOUR_MS) * HOUR_MS)
      .orderBy("hour")
      .execute();
    return rows as DeliveryCount[];
  }

  /** Newest first. */
  async deliveries(): Promise<DeliveryEvent[]> {
    const db = await this.#resolveDb();
    const rows = await db
      .selectFrom("delivery_log")
      .select(["t", "path as p", "kind as k", "status as s"])
      .orderBy("id", "desc")
      .limit(LOG_LIMIT)
      .execute();
    return rows as DeliveryEvent[];
  }

  /** True once anything was served to the public with a 2xx. */
  async hasDelivered(): Promise<boolean> {
    const db = await this.#resolveDb();
    return !!(await db
      .selectFrom("delivery_log")
      .select(sql<number>`1`.as("one"))
      .where("status", ">=", 200)
      .where("status", "<=", 299)
      .limit(1)
      .executeTakeFirst());
  }

  /** An upload that came from an app (API key or signature), not from here. */
  async markApiUpload(): Promise<void> {
    await kvInit(await this.#resolveDb(), "api_upload_seen", "1");
  }

  async apiUploadSeen(): Promise<boolean> {
    return (await kvGet(await this.#resolveDb(), "api_upload_seen")) !== undefined;
  }
}
