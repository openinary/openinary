// The admin panel's server side (apps/admin). One place to see everything an
// account has done and to act on it, because the truth about a customer is
// spread across four systems that don't know about each other: Postgres,
// Autumn/Stripe, the account's UsageMeter durable object, and Attio.
//
// Everything here is behind `adminProcedure` (one account, named by
// ADMIN_USER_ID). Anything needing the R2 binding lives in worker/app.ts
// instead - see the note above DELETE /buckets/:bucketId for why api/ can't
// reach it.

import { ORPCError } from "@orpc/server";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { apikey, user } from "../db/schema/auth.js";
import {
  type AttioPerson,
  findPersonByEmail,
  listWaitlist,
} from "../lib/attio.js";
import { auth } from "../lib/auth.js";
import {
  type AdminBilling,
  type CustomerData,
  ensureCustomer,
  getAdminBilling,
  getUsage,
  grantPlan,
} from "../lib/autumn.js";
import { listBuckets } from "../lib/bucket.js";
import { withSuspended } from "../lib/bucket-owner.js";
import type { Bindings } from "../lib/context.js";
import { adminProcedure } from "../lib/orpc.js";
import { bucketIdOf } from "./api-key.js";
import {
  pendingCdnRequests,
  readDeliveries,
  recentVideoJobs,
} from "./usage.js";

/**
 * The fiche has to render even when one upstream is down: an Autumn outage
 * must not hide the buckets, and no CRM configured must not hide the account.
 * Same policy readDeliveries already applies to an unreachable meter - log it,
 * return the empty answer, keep the page.
 */
function settle<T>(
  promise: Promise<T>,
  fallback: T,
  label: string,
): Promise<T> {
  return promise.catch((error) => {
    console.error(`admin: failed to read ${label}`, error);
    return fallback;
  });
}

/**
 * oRPC masks a plain thrown Error as a bare "Internal server error" - a sane
 * default for a customer-facing API, useless for the one person allowed in
 * here. Only ORPCError messages reach the client, so the reason a grant failed
 * (a plan id that doesn't exist, Autumn unreachable) has to be re-thrown as
 * one.
 */
async function grantPlanOrExplain(
  userId: string,
  planId: string,
  data: CustomerData,
): Promise<void> {
  try {
    await grantPlan(userId, planId, data);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: `Could not put the account on "${planId}": ${reason}`,
    });
  }
}

/**
 * `suspended` is one of better-auth's `additionalFields` (see lib/auth.ts): it
 * comes back on every user the admin endpoints return, but the plugin types
 * their result as its own UserWithRole, which knows nothing about it.
 */
function isSuspended(account: unknown): boolean {
  return Boolean((account as { suspended?: unknown }).suspended);
}

type AdminSession = Awaited<
  ReturnType<typeof auth.api.listUserSessions>
>["sessions"][number];

/** better-auth stores apikey.metadata as a JSON string; drizzle hands it back raw. */
function parseMetadata(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function apiKeysOf(userId: string) {
  const rows = await db
    .select({
      id: apikey.id,
      name: apikey.name,
      start: apikey.start,
      enabled: apikey.enabled,
      metadata: apikey.metadata,
      createdAt: apikey.createdAt,
      expiresAt: apikey.expiresAt,
      lastRequest: apikey.lastRequest,
      requestCount: apikey.requestCount,
    })
    // Queried directly rather than through auth.api.listApiKeys, which reads
    // the *caller's* keys off their session - there is no admin variant.
    .from(apikey)
    .where(eq(apikey.referenceId, userId));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    start: row.start,
    enabled: row.enabled ?? false,
    bucketId: bucketIdOf(parseMetadata(row.metadata)),
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    lastRequest: row.lastRequest?.toISOString() ?? null,
    requestCount: row.requestCount ?? 0,
  }));
}

/**
 * Flips service off (or back on) for an account. Three independent switches,
 * because three independent things authenticate a request:
 *
 * - `user.suspended` - what the admin UI lists and filters on
 * - `apikey.enabled` - verifyApiKey refuses a disabled key (KEY_DISABLED), so
 *   this costs nothing on the request path
 * - the KV owner record - the only thing the public CDN path consults
 *
 * A better-auth ban does none of these: its check runs when a *session* is
 * created, which the CDN and API keys never do.
 *
 * ponytail: un-suspending re-enables every key, including any the customer had
 * turned off themselves. Snapshot the previous per-key state if that ever
 * costs someone a key they meant to keep dead.
 */
async function setSuspended(
  env: Bindings,
  userId: string,
  suspended: boolean,
): Promise<void> {
  await db
    .update(user)
    .set({ suspended, updatedAt: new Date() })
    .where(eq(user.id, userId));
  await db
    .update(apikey)
    .set({ enabled: !suspended })
    .where(eq(apikey.referenceId, userId));

  const buckets = await listBuckets(userId);
  await Promise.all(
    buckets.map(async ({ id }) => {
      const stored = await env.BUCKET_OWNERS.get(id);
      await env.BUCKET_OWNERS.put(
        id,
        JSON.stringify(withSuspended(stored, { userId, suspended })),
      );
    }),
  );
}

export type AdminUserDetail = {
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image: string | null;
    createdAt: string;
    banned: boolean;
    banReason: string | null;
    banExpires: string | null;
    suspended: boolean;
  };
  buckets: Awaited<ReturnType<typeof listBuckets>>;
  apiKeys: Awaited<ReturnType<typeof apiKeysOf>>;
  sessions: {
    id: string;
    createdAt: string;
    expiresAt: string;
    ipAddress: string | null;
    userAgent: string | null;
  }[];
  usage: Awaited<ReturnType<typeof getUsage>>;
  billing: AdminBilling | null;
  activity: {
    deliveries: Awaited<ReturnType<typeof readDeliveries>>;
    videoJobs: Awaited<ReturnType<typeof recentVideoJobs>>;
  };
  attio: AttioPerson | null;
};

export const adminRouter = {
  /**
   * The user list. Deliberately Postgres-only: resolving each row's plan would
   * be one Autumn round trip per user, and the plan is one click away on the
   * fiche.
   */
  list: adminProcedure
    .input(
      z.object({
        search: z.string().trim().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .handler(async ({ context, input }) => {
      const { users, total } = await auth.api.listUsers({
        headers: context.headers,
        query: {
          limit: input.limit,
          offset: input.offset,
          sortBy: "createdAt",
          sortDirection: "desc",
          ...(input.search
            ? {
                searchValue: input.search,
                searchField: "email" as const,
                searchOperator: "contains" as const,
              }
            : {}),
        },
      });
      return {
        total,
        users: users.map((account) => ({
          id: account.id,
          name: account.name,
          email: account.email,
          createdAt: new Date(account.createdAt).toISOString(),
          banned: account.banned ?? false,
          suspended: isSuspended(account),
        })),
      };
    }),

  /**
   * Everything about one account, in one call. The four sources are read in
   * parallel and fail independently.
   *
   * `usage` comes from the same getUsage the customer's own plan tab uses,
   * pending meter count folded in the same way - so the admin can never be
   * looking at a different number from the one the customer is disputing.
   */
  get: adminProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .handler(async ({ context, input }): Promise<AdminUserDetail> => {
      const { userId } = input;
      const account = await auth.api.getUser({
        headers: context.headers,
        query: { id: userId },
      });

      const customerData = { name: account.name, email: account.email };
      const [
        buckets,
        apiKeys,
        sessions,
        usage,
        pendingCdn,
        billing,
        deliveries,
        videoJobs,
        attio,
      ] = await Promise.all([
        settle(listBuckets(userId), [], "buckets"),
        settle(apiKeysOf(userId), [], "api keys"),
        settle<AdminSession[]>(
          auth.api
            .listUserSessions({ headers: context.headers, body: { userId } })
            .then(({ sessions }) => sessions),
          [],
          "sessions",
        ),
        getUsage(userId, customerData),
        settle(pendingCdnRequests(context.env, userId), 0, "pending usage"),
        settle(getAdminBilling(userId), null, "billing"),
        settle(readDeliveries(context.env, userId), [], "deliveries"),
        settle(recentVideoJobs(userId), [], "video jobs"),
        settle(findPersonByEmail(account.email), null, "Attio record"),
      ]);

      if (pendingCdn > 0) {
        const cdn = usage.features.cdn_requests;
        usage.features.cdn_requests = {
          ...cdn,
          used: cdn.used + pendingCdn,
          remaining: cdn.unlimited
            ? cdn.remaining
            : Math.max(0, cdn.remaining - pendingCdn),
        };
      }

      return {
        user: {
          id: account.id,
          name: account.name,
          email: account.email,
          emailVerified: account.emailVerified,
          image: account.image ?? null,
          createdAt: new Date(account.createdAt).toISOString(),
          banned: account.banned ?? false,
          banReason: account.banReason ?? null,
          banExpires: account.banExpires
            ? new Date(account.banExpires).toISOString()
            : null,
          suspended: isSuspended(account),
        },
        buckets,
        apiKeys,
        sessions: sessions.map((session) => ({
          id: session.id,
          createdAt: new Date(session.createdAt).toISOString(),
          expiresAt: new Date(session.expiresAt).toISOString(),
          ipAddress: session.ipAddress ?? null,
          userAgent: session.userAgent ?? null,
        })),
        usage,
        billing,
        activity: { deliveries, videoJobs },
        attio,
      };
    }),

  /**
   * The cloud waitlist, with the accounts that already exist marked - so the
   * same person doesn't get granted access twice. One extra Postgres query for
   * the whole page.
   */
  waitlist: adminProcedure.handler(async () => {
    const people = await listWaitlist();
    const emails = people
      .map((person) => person.email)
      .filter((email): email is string => Boolean(email));
    const existing = emails.length
      ? await db
          .select({ id: user.id, email: user.email })
          .from(user)
          .where(inArray(user.email, emails))
      : [];
    const accountByEmail = new Map(existing.map((row) => [row.email, row.id]));
    return people.map((person) => ({
      ...person,
      userId: person.email ? (accountByEmail.get(person.email) ?? null) : null,
    }));
  }),

  /**
   * Opens an account for someone off the waitlist, on the free plan, and mails
   * them a sign-in code.
   *
   * Deliberately does *not* put them on a paid plan. Every plan above free
   * prices overage, which Stripe will not open a subscription for without a
   * card on file - and nobody can enter that card on the customer's behalf. So
   * the admin's job stops at "the door is open"; choosing and paying for a plan
   * happens inside the app, by the person whose card it is.
   *
   * No password either: sign-in is a mailed code (see emailOTP in lib/auth.ts),
   * and createUser without a password deliberately creates no credential
   * account. Creating the user here is also what makes the mail possible at
   * all - prod sets `disableSignUp`, so the OTP endpoint refuses to write to an
   * address it doesn't already know.
   */
  createUser: adminProcedure
    .input(
      z.object({
        email: z.email(),
        name: z.string().trim().min(1).max(120),
      }),
    )
    .handler(async ({ context, input }) => {
      const { user: created } = await auth.api.createUser({
        headers: context.headers,
        body: { email: input.email, name: input.name },
      });

      // Autumn's free plan is auto_enable, so creating the customer *is*
      // granting it. Not fatal: every metering call does this same getOrCreate,
      // so a failure here is repaired by the account's first request.
      const customerData = { name: created.name, email: created.email };
      await settle(
        ensureCustomer(created.id, customerData),
        undefined,
        "Autumn customer",
      );

      // A magic link rather than a sign-in code: this email is unsolicited, so
      // it gets read whenever they next open their inbox. A code expires in ten
      // minutes and would be dead by then; the link lasts a day (see
      // MAGIC_LINK_EXPIRY_HOURS in lib/auth.ts).
      //
      // Reported rather than thrown: the account exists either way, and they
      // can always ask for a code from the sign-in form now that their address
      // is known. An error here would suggest nothing happened at all.
      let emailSent = true;
      try {
        await auth.api.signInMagicLink({
          // The endpoint is declared `requireHeaders` - it origin-checks the
          // caller - so a server-side call has to pass some along.
          headers: context.headers,
          body: {
            email: created.email,
            // Where the link drops them once the session cookie is set: the
            // customer dashboard, which is a trusted origin (the verify
            // endpoint origin-checks this value).
            callbackURL: process.env.CORS_ORIGIN || "/",
          },
        });
      } catch (error) {
        console.error("admin: failed to mail a sign-in link", error);
        emailSent = false;
      }

      return { userId: created.id, emailSent };
    }),

  /** Moves an existing account onto a plan by hand. Free plans only. */
  setPlan: adminProcedure
    .input(z.object({ userId: z.string().min(1), planId: z.string().min(1) }))
    .handler(async ({ input }) => {
      await grantPlanOrExplain(input.userId, input.planId, {});
      return { success: true };
    }),

  /** Service off. The account can still sign in and read its own data. */
  suspend: adminProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      await setSuspended(context.env, input.userId, true);
      return { success: true };
    }),

  unsuspend: adminProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      await setSuspended(context.env, input.userId, false);
      return { success: true };
    }),

  /**
   * Sign-in off, and every live session dropped (banUser revokes them). Does
   * not touch the CDN or API keys - `suspend` is the switch for that, and the
   * two are meant to be usable separately.
   */
  ban: adminProcedure
    .input(
      z.object({
        userId: z.string().min(1),
        reason: z.string().trim().max(500).optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      await auth.api.banUser({
        headers: context.headers,
        body: { userId: input.userId, banReason: input.reason },
      });
      return { success: true };
    }),

  unban: adminProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      await auth.api.unbanUser({
        headers: context.headers,
        body: { userId: input.userId },
      });
      return { success: true };
    }),
};
