// Loops (lifecycle email) - contacts and events over plain fetch, the same
// shape as lib/attio.ts: a handful of endpoints, and the Worker has no room
// for an SDK that would only wrap them.
//
// The split with Loops is deliberate and load-bearing. This file owns *who* a
// contact is and *when* something happened to them; the sequences themselves -
// which email follows which, how long the delay is, who gets skipped - are
// Loops workflows, built from api/scripts/loops-sequences.ts. Nothing here
// decides what an email says, so rewriting the copy is never a deploy.
//
// Every failure is swallowed, exactly like captureEvent in lib/analytics.ts:
// a marketing platform being down must never cost a signup.

import { count, eq, max } from "drizzle-orm";
import { db } from "../db/index.js";
import { apikey, session, user } from "../db/schema/auth.js";
import { bucket } from "../db/schema/bucket.js";
import { getUsage } from "./autumn.js";
import {
  APPROACHING_LIMIT,
  crossedInactivity,
  daysUntil,
  firstNameOf,
  INACTIVE_DAYS,
  nextResetAt,
  worstFeature,
} from "./lifecycle.js";

const API = "https://app.loops.so/api/v1";

/**
 * One Autumn round trip and one Loops round trip per account, all inside a
 * single cron invocation, which gets 1000 subrequests.
 *
 * ponytail: a hard cap rather than pagination - alpha is nowhere near it.
 * Page through `createdAt` when the warning below starts firing.
 */
const MAX_CONTACTS_PER_RUN = 400;

async function loops(
  path: string,
  body: unknown,
  method: "POST" | "PUT" = "POST",
): Promise<unknown | null> {
  const key = process.env.LOOPS_API_KEY;
  if (!key) return null;

  try {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.error(
        `Loops ${path} rejected (${response.status}): ${await response.text()}`,
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(`Loops ${path} failed`, error);
    return null;
  }
}

/**
 * The contact properties the workflows filter on. Names are the Loops API
 * names, so they read the same here, in the audience filters in
 * api/scripts/loops-sequences.ts, and as `{contact.x}` inside the emails.
 * Creating them in the Loops account is `loops-build.ts --properties`.
 */
export type ContactProperties = {
  /** Autumn plan id: "free", "early_access" or "cloud". */
  plan: string;
  bucketCount: number;
  apiKeyCount: number;
  storageMb: number;
  transformCount: number;
  /** How far into the worst feature's allowance, 0-100+. */
  usagePercent: number;
  lastActiveAt: string;
};

/**
 * Upsert, so the first call for an address creates the contact - which is what
 * fires the signup sequence, since its trigger is "contact created" rather
 * than an event we would then have to keep in step with the account.
 */
export async function identifyContact(
  account: { id: string; email: string; name: string },
  properties: Partial<ContactProperties> = {},
): Promise<void> {
  await loops(
    "/contacts/update",
    {
      email: account.email,
      userId: account.id,
      firstName: firstNameOf(account.name),
      ...properties,
    },
    "PUT",
  );
}

/**
 * Erase the contact, which is also the only way to get someone out of a
 * sequence they are part-way through.
 *
 * Without this a deleted account keeps receiving lifecycle email for weeks:
 * the workflows hold their own queue, nothing in Loops watches our `user`
 * table, and the daily sync stops refreshing properties the moment the row is
 * gone - so the filters go on deciding from whatever was true the last morning
 * the account existed.
 *
 * By userId rather than email: it is the identifier Loops was given at signup,
 * and it survives the address changing. The API takes exactly one of the two,
 * and answers 404 for an id it has never seen - which every account created
 * before this integration shipped will be, so `rejected (404): This userId was
 * not found` in the log after deleting an old account is the expected answer
 * and not a failure. Like every call here it is swallowed either way.
 */
export async function forgetContact(userId: string): Promise<void> {
  await loops("/contacts/delete", { userId });
}

/** Triggers any workflow whose EventTrigger names this event. */
export async function trackContact(
  email: string,
  eventName: string,
  eventProperties: Record<string, string | number | boolean> = {},
): Promise<void> {
  await loops("/events/send", { email, eventName, eventProperties });
}

/**
 * Push every account's marketing profile to Loops and fire the two events
 * nobody else can observe: going quiet, and running out of free allowance.
 *
 * One scan rather than a call sprinkled through every router that touches a
 * bucket or a key. The counts it needs already sit in Postgres and Autumn, so
 * the alternative is the same numbers recomputed in five places, each able to
 * drift on its own.
 *
 * The cost is latency: a plan change is visible to Loops within a day, not
 * within a second. ponytail: fine for every sequence here except the paid
 * welcome, which reads as "the morning after" instead of "on checkout" - wire
 * an Autumn webhook to identifyContact if that turns out to matter.
 */
export async function syncLifecycle(): Promise<void> {
  if (!process.env.LOOPS_API_KEY) return;

  const accounts = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.suspended, false))
    .limit(MAX_CONTACTS_PER_RUN);
  if (accounts.length === MAX_CONTACTS_PER_RUN) {
    console.warn(
      `Loops lifecycle sync hit its ${MAX_CONTACTS_PER_RUN}-account cap; accounts past it were skipped`,
    );
  }
  if (accounts.length === 0) return;

  // Three grouped reads instead of three per account: at 400 accounts the
  // per-account version is 1200 queries against a serverless Postgres.
  const [buckets, keys, lastSeen] = await Promise.all([
    db
      .select({ userId: bucket.userId, total: count() })
      .from(bucket)
      .groupBy(bucket.userId),
    // better-auth's apiKey plugin names the owner column `referenceId`, not
    // `userId` - it is the user id all the same (see the FK in schema/auth.ts).
    db
      .select({ userId: apikey.referenceId, total: count() })
      .from(apikey)
      .groupBy(apikey.referenceId),
    db
      .select({ userId: session.userId, at: max(session.updatedAt) })
      .from(session)
      .groupBy(session.userId),
  ]);
  const bucketCounts = new Map(buckets.map((row) => [row.userId, row.total]));
  const keyCounts = new Map(keys.map((row) => [row.userId, row.total]));
  const seenAt = new Map(lastSeen.map((row) => [row.userId, row.at]));

  const now = Date.now();
  for (const account of accounts) {
    // Per account, so one unreachable Autumn customer or one rejected contact
    // doesn't cost every account after it in the list.
    try {
      const usage = await getUsage(account.id, {
        name: account.name,
        email: account.email,
      });
      const plan = usage.planId ?? "free";
      const worst = worstFeature(usage.features);
      const usagePercent = Math.round(worst.ratio * 100);
      // Sessions are the only durable "was here" stamp there is; an account
      // that has never signed in falls back to when it was created, which is
      // the right start for the win-back clock anyway.
      const lastActiveAt = seenAt.get(account.id) ?? account.createdAt;

      await identifyContact(account, {
        plan,
        bucketCount: bucketCounts.get(account.id) ?? 0,
        apiKeyCount: keyCounts.get(account.id) ?? 0,
        storageMb: Math.round(usage.features.storage_mb.used),
        transformCount: usage.features.image_transformations.used,
        usagePercent,
        lastActiveAt: lastActiveAt.toISOString(),
      });

      if (crossedInactivity(lastActiveAt, now)) {
        await trackContact(account.email, "cloud_inactive", {
          days: INACTIVE_DAYS,
        });
      }

      // Free only: a metered plan has no wall to warn about, and telling
      // someone who already pays that they are "approaching the limit" is the
      // same mistake quotaErrorBody in lib/autumn.ts exists to avoid.
      if (plan === "free" && worst.ratio >= APPROACHING_LIMIT) {
        await trackContact(account.email, "cloud_approaching_limit", {
          usagePercent,
          // The soonest monthly refill, not the worst feature's own: storage
          // never resets, so an account at 90% of its gigabyte would otherwise
          // be told its limits come back in zero days. See nextResetAt.
          resetsInDays: daysUntil(nextResetAt(usage.features), now) ?? 0,
        });
      }
    } catch (error) {
      console.error(`Loops lifecycle sync failed for ${account.id}`, error);
    }
  }
}
