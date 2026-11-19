// Which account a signed-in person is acting on, and what their role there
// lets them do. An account's id is always its owner's user id: the key the R2
// prefix, Autumn customer, UsageMeter and BUCKET_OWNERS already use, so a team
// is only a list of people allowed into someone's account (lib/auth.ts).

import { ORPCError } from "@orpc/server";
import { and, eq, or } from "drizzle-orm";
import { db } from "../../shared/db/index.js";
import { member, organization, user } from "../../shared/db/schema/auth.js";
import { teamsEnabledFor } from "../config.js";
import {
  assertOwnsBucket,
  type Bucket,
  getActiveBucketId,
  listBuckets,
  ownsBucket,
  selectBucket,
} from "./bucket.js";

export const ROLES = ["owner", "admin", "member"] as const;
export type Role = (typeof ROLES)[number];

export type Action =
  | "media"
  | "bucket.manage"
  | "apiKey.manage"
  | "member.manage"
  | "billing";

const ALLOWED: Record<Role, readonly Action[]> = {
  owner: ["media", "bucket.manage", "apiKey.manage", "member.manage", "billing"],
  admin: ["media", "bucket.manage", "apiKey.manage", "member.manage"],
  member: ["media"],
};

export function can(role: Role, action: Action): boolean {
  return ALLOWED[role]?.includes(action) ?? false;
}

export type Account = {
  /** The owner's user id: every tenant key. */
  accountId: string;
  role: Role;
  /** Set only when acting inside someone else's account. */
  memberId?: string;
  /** That member's own bucket choice (member.active_bucket_id). */
  memberBucketId?: string | null;
};

export type Membership = {
  memberId: string;
  role: string;
  ownerUserId: string;
  activeBucketId: string | null;
};

/**
 * Pure: the account a session lands on. No team selected, a team the person
 * was removed from, or a team whose owner isn't in the rollout all fall back
 * to their own account rather than failing the request.
 */
export function pickAccount(
  userId: string,
  membership: Membership | undefined,
  teamsOn: (ownerUserId: string) => boolean = teamsEnabledFor,
): Account {
  const personal: Account = { accountId: userId, role: "owner" };
  if (!membership || !teamsOn(membership.ownerUserId)) return personal;
  if (membership.ownerUserId === userId) return personal;
  const role = (ROLES as readonly string[]).includes(membership.role)
    ? (membership.role as Role)
    : "member";
  return {
    accountId: membership.ownerUserId,
    // Only the owner is ever "owner": a second plugin-level owner still gets
    // admin rights here, never billing on someone else's card.
    role: role === "owner" ? "admin" : role,
    memberId: membership.memberId,
    memberBucketId: membership.activeBucketId,
  };
}

export async function findMembership(
  userId: string,
  organizationId: string,
): Promise<Membership | undefined> {
  const [row] = await db
    .select({
      memberId: member.id,
      role: member.role,
      ownerUserId: organization.ownerUserId,
      activeBucketId: member.activeBucketId,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(
      and(eq(member.userId, userId), eq(member.organizationId, organizationId)),
    );
  return row;
}

type SessionLike = {
  user: { id: string };
  session: { activeOrganizationId?: string | null };
};

// ponytail: one DB read per request while a team is active; cache in the
// session KV if it ever shows in latency.
export async function resolveAccount(session: SessionLike): Promise<Account> {
  const orgId = session.session.activeOrganizationId;
  if (!orgId) return { accountId: session.user.id, role: "owner" };
  return pickAccount(session.user.id, await findMembership(session.user.id, orgId));
}

export function assertCan(account: Account, action: Action): void {
  if (!can(account.role, action)) {
    throw new ORPCError("FORBIDDEN", {
      message: "Your role on this account doesn't allow that.",
    });
  }
}

/** Pure: a member's own pick if it still exists, else the account default. */
export function chooseBucket(
  bucketIds: readonly string[],
  memberBucketId: string | null | undefined,
  accountDefault: string,
): string {
  return memberBucketId && bucketIds.includes(memberBucketId)
    ? memberBucketId
    : accountDefault;
}

/**
 * The bucket this person is viewing. The owner keeps bucket.active, which is
 * also what unscoped legacy API keys follow; members keep their own choice so
 * clicking a bucket never moves anyone else.
 */
export async function activeBucketFor(account: Account): Promise<string> {
  const fallback = await getActiveBucketId(account.accountId);
  if (!account.memberId || !account.memberBucketId) return fallback;
  return (await ownsBucket(account.accountId, account.memberBucketId))
    ? account.memberBucketId
    : fallback;
}

/** listBuckets, with `active` marking this person's bucket, not the owner's. */
export async function bucketsFor(account: Account): Promise<Bucket[]> {
  const buckets = await listBuckets(account.accountId);
  if (!account.memberId) return buckets;
  const fallback = (buckets.find((b) => b.active) ?? buckets[0]).id;
  const active = chooseBucket(
    buckets.map((b) => b.id),
    account.memberBucketId,
    fallback,
  );
  return buckets.map((b) => ({ ...b, active: b.id === active }));
}

export async function selectBucketFor(
  account: Account,
  bucketId: string,
): Promise<void> {
  if (!account.memberId) return selectBucket(account.accountId, bucketId);
  await assertOwnsBucket(account.accountId, bucketId);
  await db
    .update(member)
    .set({ activeBucketId: bucketId })
    .where(eq(member.id, account.memberId));
}

/** For the admin panel: who is on this account, and whose accounts this user joined. */
export async function teamOf(userId: string) {
  const rows = await db
    .select({
      organizationId: member.organizationId,
      ownerUserId: organization.ownerUserId,
      teamName: organization.name,
      userId: member.userId,
      role: member.role,
      email: user.email,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .innerJoin(user, eq(user.id, member.userId))
    .where(or(eq(organization.ownerUserId, userId), eq(member.userId, userId)));
  return {
    members: rows
      .filter((r) => r.ownerUserId === userId)
      .map(({ userId: id, email, role }) => ({ userId: id, email, role })),
    memberOf: rows
      .filter((r) => r.userId === userId && r.ownerUserId !== userId)
      .map(({ ownerUserId, teamName, role }) => ({
        accountId: ownerUserId,
        name: teamName,
        role,
      })),
  };
}
