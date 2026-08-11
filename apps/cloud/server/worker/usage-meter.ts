import { DurableObject } from "cloudflare:workers";
import { getFeatureBalance, trackFeature } from "../api/lib/autumn.js";
import { mergeOwnerState } from "../api/lib/bucket-owner.js";
import type { DeliveryEvent } from "../api/lib/delivery-log.js";
import { appendCapped, seenRecently } from "../api/lib/delivery-log.js";
import { sendDeliveryLogs } from "./posthog.js";

// How long counts and log lines may exist only in this instance's memory.
// Bounded by eviction, not by cost: an idle Durable Object is dropped from
// memory after roughly ten seconds, and anything not yet written is gone with
// it. An earlier version batched for a whole minute and lost every delivery an
// account made unless its traffic was continuous - the log looked like it was
// deleting itself, and sparse accounts were never billed at all.
const PERSIST_INTERVAL_MS = 5_000;

// How long usage may sit here before Autumn hears about it. Unlike the persist
// interval this one is free to be long: the data is already durable, and the
// dashboard reads what hasn't flushed yet straight off this object (see
// pending()), so a customer never waits on it to see a current number.
const FLUSH_INTERVAL_MS = 60_000;
// Used instead of the above once an account is within FAST_FLUSH_MARGIN of a
// cap. Blocking is the only thing that needs a short window, and only for the
// handful of accounts about to be blocked.
const FAST_FLUSH_INTERVAL_MS = 10_000;
const FAST_FLUSH_MARGIN = 1_000;

// How many deliveries the activity tab shows. Also the ceiling on what one
// window may persist, which is what keeps a segment inside the 128 KiB a
// single storage value may hold.
const MAX_EVENTS = 500;

/**
 * How long a launched transform may stay unconfirmed before it is written off
 * as failed and billed to nobody. A cold container has been measured at ~15s
 * for one image, so this is that with room to spare rather than a guess about
 * the encoder.
 */
const TRANSFORM_CONFIRM_MS = 5 * 60_000;

// How often the unconfirmed set is re-checked. One R2 head per key per tick,
// and the overwhelming majority confirm on the first one - only a container
// that is genuinely slow costs a second look.
const TRANSFORM_RECHECK_MS = 30_000;

// Ceiling on unconfirmed transforms held at once. Reached only if an account
// launches thousands inside one confirm window while every one of them fails;
// past it the oldest are dropped unbilled, which is the safe direction.
const MAX_UNCONFIRMED = 500;

/** Counters that have to outlive an eviction; written as one row. */
type MeterState = { count: number; flushDueAt: number };

/** R2 key of a launched transform -> when it was launched (epoch ms). */
type Unconfirmed = Record<string, number>;

// One instance per user (see worker/index.ts's idFromName(userId)), absorbing
// every /b/* hit for that account and reporting the total to Autumn on a timer
// instead of one API call per CDN request. `hit()` runs off the response path
// (always called via ctx.waitUntil), so it adds no latency to the request that
// triggered it.
//
// Storage is still never touched per hit - that write was the single most
// expensive part of serving a cached asset, at $1.00 per million rows written,
// more than the Worker invocation, the KV read and the R2 GET put together.
// Instead it is touched once per PERSIST_INTERVAL_MS of activity, so its cost
// tracks how long an account is active rather than how much traffic it serves:
// a few rows per five seconds, whether that window held one delivery or a
// thousand.
export class UsageMeter extends DurableObject<Env> {
  #count = 0;
  #pending: DeliveryEvent[] = [];
  // Shipped to PostHog, then dropped. Never persisted and never returned by
  // recent() - see DeliveryContext.quiet in worker/index.ts for what lands
  // here. Losing a window of it to an eviction costs observability, not money,
  // which is why it is the one thing here that does not earn a storage write.
  #quiet: DeliveryEvent[] = [];
  #buckets: string[] = [];
  // Last time each viewer opened each asset, for the re-open collapsing in
  // hit(). Memory only, and deliberately so: this exists to stop a duplicate
  // charge worth a fraction of a cent, which is not worth the storage write per
  // delivery that the rest of this class goes out of its way to avoid.
  #seen = new Map<string, number>();
  #flushDueAt = 0;
  #flushMs = FLUSH_INTERVAL_MS;
  /** When the alarm is currently set for, or null if none is pending. */
  #alarmAt: number | null = null;
  // Transforms launched but not yet known to have worked. Persisted, because
  // the whole point is to outlive the request that launched them - that
  // request is long gone by the time the container answers.
  #unconfirmed: Unconfirmed = {};
  // Whether this account has ever received an upload carrying a presigned
  // token, i.e. one their own app sent rather than one dropped into our
  // dashboard. Onboarding, not money - see markApiUpload.
  #apiUpload = false;

  constructor(ctx: DurableObjectState<Env>, env: Env) {
    super(ctx, env);
    // Nothing may observe a half-restored instance, so this has to finish
    // before the first hit() or alarm() is dispatched. The log segments are
    // deliberately not read here: only recent() needs them, and it reads them
    // on demand rather than making every delivery pay for the list.
    ctx.blockConcurrencyWhile(async () => {
      this.#buckets = (await ctx.storage.get<string[]>("buckets")) ?? [];
      const state = await ctx.storage.get<MeterState>("meter");
      this.#count = state?.count ?? 0;
      this.#flushDueAt = state?.flushDueAt ?? 0;
      this.#unconfirmed =
        (await ctx.storage.get<Unconfirmed>("unconfirmed")) ?? {};
      this.#apiUpload = (await ctx.storage.get<boolean>("apiUpload")) ?? false;
      this.#alarmAt = await ctx.storage.getAlarm();
    });
  }

  /**
   * Records that a transform was just handed to the container, to be billed
   * once it is known to have produced something.
   *
   * The Worker cannot do this itself. It answers 202 immediately and stops
   * existing, while the container builds the whole image before replying - so
   * the promise the Worker would have billed off never settles, and nothing
   * was ever charged for an image transformation. This object outlives the
   * request, so it can wait.
   *
   * `key` is the R2 key the derivative will land under (worker/index.ts's
   * derivativeKey). Its presence at confirm time is the proof of success:
   * core writes the object before it answers, so an object under that key
   * means the work happened - no matter what became of the HTTP response.
   */
  async transformLaunched(key: string): Promise<void> {
    const now = Date.now();
    // Same key twice is one derivative, so it stays one charge - two callers
    // racing for the same miss must not bill twice.
    if (this.#unconfirmed[key] === undefined) this.#unconfirmed[key] = now;

    const keys = Object.keys(this.#unconfirmed);
    if (keys.length > MAX_UNCONFIRMED) {
      for (const stale of keys
        .sort((a, b) => this.#unconfirmed[a] - this.#unconfirmed[b])
        .slice(0, keys.length - MAX_UNCONFIRMED)) {
        delete this.#unconfirmed[stale];
      }
    }

    await this.ctx.storage.put("unconfirmed", this.#unconfirmed);
    // Deliberately not the persist tick: heading R2 before the container has
    // had time to write only finds nothing and costs a lookup.
    await this.#arm(now + TRANSFORM_RECHECK_MS);
  }

  /**
   * @param dedupeKey Identifies viewer + asset. A second delivery under the
   * same key inside the dedupe window is the same viewing re-opening the
   * stream, so it is dropped outright rather than logged with cdn 0 - the
   * activity tab applies the same rule as the invoice, or a customer reading
   * two lines against one charge would be right to call it overbilling.
   */
  async hit(
    event: DeliveryEvent,
    quiet = false,
    dedupeKey?: string,
  ): Promise<void> {
    if (dedupeKey && seenRecently(this.#seen, dedupeKey, Date.now())) return;

    if (quiet) {
      this.#quiet = appendCapped(this.#quiet, event, MAX_EVENTS);
    } else {
      // event.cdn is 0 for anything that failed to deliver bytes - a quota
      // 402, an account 429, a 404. Those still belong in the log (the
      // customer has to be able to see them) but must never reach Autumn.
      this.#count += event.cdn;
      this.#pending = appendCapped(this.#pending, event, MAX_EVENTS);
    }

    const now = Date.now();
    if (this.#flushDueAt === 0) this.#flushDueAt = now + this.#flushMs;

    if (!this.#buckets.includes(event.b)) {
      this.#buckets.push(event.b);
      // Rare (once per bucket per instance lifetime) and alarm() needs it to
      // know which KV keys carry the block flag, so this one is not batched.
      await this.ctx.storage.put("buckets", this.#buckets);
    }

    await this.#arm(now + PERSIST_INTERVAL_MS);
  }

  /**
   * The activity tab's data: the persisted log plus the current window's
   * not-yet-persisted deliveries.
   */
  async recent(): Promise<{ events: DeliveryEvent[]; pendingCdn: number }> {
    const stored = await this.#storedEvents();
    return {
      events: [...stored, ...this.#pending].slice(-MAX_EVENTS),
      pendingCdn: this.#count,
    };
  }

  /**
   * Just the count Autumn has not been told about yet. Separate from recent()
   * because the plan tab asks for this on every open and needs none of the
   * log: answering from memory avoids listing 500 stored events for a
   * one-integer question. Adding it to the Autumn balance is what makes the
   * dashboard current without shortening the flush interval.
   */
  async pending(): Promise<number> {
    return this.#count;
  }

  /**
   * Records that an upload arrived with a presigned token, which is the one
   * thing that proves a customer's *app* uploaded rather than the customer
   * dropping a file into our dashboard - POST /upload takes both, and only
   * the token path can be reached without our session cookie.
   *
   * Here rather than in a Postgres column because this object is already the
   * per-account thing the Get started page reads (see pending()), so it costs
   * no migration and no extra round trip. One storage write per account, ever:
   * the guard makes every upload after the first free.
   */
  async markApiUpload(): Promise<void> {
    if (this.#apiUpload) return;
    this.#apiUpload = true;
    await this.ctx.storage.put("apiUpload", true);
  }

  /** Whether markApiUpload has ever been called for this account. */
  async apiUploadSeen(): Promise<boolean> {
    return this.#apiUpload;
  }

  /**
   * Drops everything this instance holds for the account. Called only when an
   * admin deletes the account outright (see DELETE /admin/users/:userId in
   * worker/app.ts) - nothing else clears this storage, so a deleted customer's
   * delivery history would otherwise outlive every other trace of them.
   *
   * In-memory state is cleared alongside the storage, and the pending count is
   * discarded rather than flushed: the Autumn customer is being deleted in the
   * same operation, so there is nobody left to bill.
   */
  async wipe(): Promise<void> {
    this.#count = 0;
    this.#pending = [];
    this.#quiet = [];
    this.#buckets = [];
    this.#seen.clear();
    this.#unconfirmed = {};
    this.#apiUpload = false;
    this.#flushDueAt = 0;
    this.#alarmAt = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  // Oldest first, matching storage.list's lexicographic key order (the keys
  // embed epoch ms, which stays 13 digits for the next two centuries).
  async #storedEvents(): Promise<DeliveryEvent[]> {
    const segments = await this.ctx.storage.list<DeliveryEvent[]>({
      prefix: "log:",
    });
    return [...segments.values()].flat();
  }

  /**
   * Two jobs on one timer. Making the log durable happens every time and comes
   * first, because a Durable Object storage write is rolled back if the
   * handler throws - anything fallible has to run after the write it must not
   * take down with it, and #flush swallows its own failures for the same
   * reason.
   */
  async alarm(): Promise<void> {
    this.#alarmAt = null;
    const userId = this.ctx.id.name;
    // Guarded before anything is consumed: an early return that had already
    // emptied the buffers would silently destroy a window of usage.
    if (!userId) return;

    const events = this.#pending;
    const quiet = this.#quiet;
    this.#pending = [];
    this.#quiet = [];

    await this.#persist(events);
    await this.#confirmTransforms(userId);
    if (Date.now() >= this.#flushDueAt) await this.#flush(userId);
    // Shipped per persist window rather than per Autumn flush, so PostHog is
    // exactly as durable as the log: buffering these for a whole minute meant
    // an eviction dropped them, which is why the logs view stayed empty.
    await sendDeliveryLogs(this.env.POSTHOG_PROJECT_TOKEN, userId, [
      ...events,
      ...quiet,
    ]);

    // Only the Autumn flush can still be owed - everything else is now either
    // durable or sent - so the next alarm is its deadline rather than another
    // persist tick. A delivery arriving before then pulls it forward.
    if (this.#count > 0) await this.#arm(this.#flushDueAt);
    // Transforms still waiting on the container need their own tick, which is
    // sooner than a flush deadline and has to be armed even on an account
    // whose count is zero.
    if (Object.keys(this.#unconfirmed).length > 0)
      await this.#arm(Date.now() + TRANSFORM_RECHECK_MS);
  }

  // setAlarm overwrites, so this only ever moves the alarm earlier: a burst
  // arriving while a distant flush is scheduled gets its own persist tick,
  // and a quiet account keeps the single alarm it already had.
  async #arm(at: number): Promise<void> {
    if (this.#alarmAt !== null && this.#alarmAt <= at) return;
    this.#alarmAt = at;
    await this.ctx.storage.setAlarm(at);
  }

  // One segment per window rather than one row per delivery, plus the counter
  // row, then the oldest segments dropped until the log is back under
  // MAX_EVENTS.
  async #persist(events: DeliveryEvent[]): Promise<void> {
    await this.ctx.storage.put<MeterState>("meter", {
      count: this.#count,
      flushDueAt: this.#flushDueAt,
    });
    if (events.length === 0) return;
    await this.ctx.storage.put(`log:${Date.now()}`, events);

    const segments = await this.ctx.storage.list<DeliveryEvent[]>({
      prefix: "log:",
    });
    const keys = [...segments.keys()];
    let kept = 0;
    // Walk newest to oldest, keeping segments until MAX_EVENTS is covered;
    // everything older than that is what the tab would never show anyway.
    for (let i = keys.length - 1; i >= 0; i--) {
      if (kept >= MAX_EVENTS) {
        await this.ctx.storage.delete(keys.slice(0, i + 1));
        return;
      }
      kept += segments.get(keys[i])?.length ?? 0;
    }
  }

  /**
   * Heads R2 for every transform still waiting on an answer. An object under
   * the key means the container produced the derivative, whatever became of
   * its HTTP response - core writes before it replies, which is exactly why
   * this is a sounder proof of work done than the response ever was.
   *
   * Anything still missing after TRANSFORM_CONFIRM_MS is written off unbilled.
   * That is the same side #flush errs on: a transform we cannot prove happened
   * stays on our dime.
   */
  async #confirmTransforms(userId: string): Promise<void> {
    const keys = Object.keys(this.#unconfirmed);
    if (keys.length === 0) return;

    const now = Date.now();
    let billed = 0;
    let changed = false;

    await Promise.all(
      keys.map(async (key) => {
        // A failed head is indistinguishable from "not there yet", so it just
        // leaves the key for the next tick rather than writing it off.
        const landed = await this.env.MEDIA_BUCKET.head(key).catch(() => null);
        if (landed) {
          billed += 1;
          delete this.#unconfirmed[key];
          changed = true;
          return;
        }
        if (now - this.#unconfirmed[key] >= TRANSFORM_CONFIRM_MS) {
          delete this.#unconfirmed[key];
          changed = true;
        }
      }),
    );

    if (changed) await this.ctx.storage.put("unconfirmed", this.#unconfirmed);
    if (billed === 0) return;

    try {
      await trackFeature(userId, "image_transformations", billed);
    } catch (error) {
      // Same reasoning as the CDN count below: Autumn's track is not
      // idempotent, so a retry after an ambiguous failure risks billing twice.
      console.error(`Failed to meter ${billed} image transformations`, error);
    }
  }

  /**
   * Reports accumulated hits, then re-checks the balance and writes the
   * verdict into BUCKET_OWNERS (keyed by every bucket this account has sent
   * traffic through) so worker/index.ts's resolveBucketOwner picks up the
   * block or unblock on its next KV read - no extra request-path lookup.
   *
   * Every step swallows its own failure. This runs after #persist, and an
   * exception here would roll back the log segment that call just wrote,
   * turning a failed Autumn call into lost customer-visible history.
   */
  async #flush(userId: string): Promise<void> {
    const count = this.#count;
    this.#count = 0;
    this.#flushDueAt = Date.now() + this.#flushMs;
    await this.ctx.storage.put<MeterState>("meter", {
      count: 0,
      flushDueAt: this.#flushDueAt,
    });

    if (count > 0) {
      try {
        await trackFeature(userId, "cdn_requests", count);
      } catch (error) {
        // Dropped rather than retried: Autumn's track is not idempotent, so a
        // retry after an ambiguous failure risks billing twice, and erring
        // toward not charging is the correct side to fail on for money.
        console.error(`Failed to meter ${count} CDN requests`, error);
      }
    }

    const { remaining, unlimited } = await getFeatureBalance(
      userId,
      "cdn_requests",
    );
    const blocked = !unlimited && remaining <= 0;
    this.#flushMs =
      !unlimited && remaining < FAST_FLUSH_MARGIN
        ? FAST_FLUSH_INTERVAL_MS
        : FLUSH_INTERVAL_MS;

    try {
      await Promise.all(
        this.#buckets.map(async (bucketId) => {
          // Read before write: the same KV value carries the admin panel's
          // `suspended` flag, which is not ours to recompute. Costs one KV
          // read per bucket per flush - once a minute, and only for accounts
          // actually serving traffic.
          const stored = await this.env.BUCKET_OWNERS.get(bucketId);
          await this.env.BUCKET_OWNERS.put(
            bucketId,
            JSON.stringify(mergeOwnerState(stored, { userId, blocked })),
          );
        }),
      );
    } catch (error) {
      console.error(`Failed to write block state for ${userId}`, error);
    }
  }
}
