// Teams: who is on the active account, invitations, and switching accounts.
// Membership changes go through better-auth's organization endpoints with the
// caller's headers, so the plugin applies its own role checks on top of ours.
// See lib/account.ts for what an account is.

import { ORPCError } from "@orpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../shared/db/index.js";
import {
  invitation,
  member,
  organization,
  user,
} from "../../shared/db/schema/auth.js";
import { teamsEnabledFor } from "../config.js";
import { can, findMembership } from "../lib/account.js";
import { auth } from "../lib/auth.js";
import { getSeatLimit } from "../lib/billing.js";
import { accountProcedure, protectedProcedure } from "./orpc.js";

/** Never "owner": there is exactly one, the account itself. */
const inviteRole = z.enum(["admin", "member"]);

async function orgOf(accountId: string) {
  const [row] = await db
    .select({ id: organization.id, name: organization.name })
    .from(organization)
    .where(eq(organization.ownerUserId, accountId));
  return row;
}

/** The team behind an account, or FORBIDDEN outside the rollout. */
async function requireOrg(accountId: string) {
  if (!teamsEnabledFor(accountId)) throw new ORPCError("FORBIDDEN");
  const org = await orgOf(accountId);
  if (!org) throw new ORPCError("NOT_FOUND", { message: "No team yet" });
  return org;
}

async function rethrow<T>(call: Promise<T>): Promise<T> {
  try {
    return await call;
  } catch (error) {
    // better-auth's APIError carries a message worth showing (limit reached,
    // already a member, ...); oRPC would otherwise turn it into a bare 500.
    const message =
      (error as { body?: { message?: string } }).body?.message ??
      (error as Error).message;
    throw new ORPCError("BAD_REQUEST", { message });
  }
}

export const teamRouter = {
  /** Everything the switcher and the Team tab need to decide what to show. */
  overview: protectedProcedure.handler(async ({ context }) => {
    const me = context.session.user;
    const memberships = await db
      .select({
        accountId: organization.ownerUserId,
        name: organization.name,
        role: member.role,
      })
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(eq(member.userId, me.id));

    const accounts = [
      { accountId: me.id, name: me.name || me.email, role: "owner" as const },
      ...memberships
        .filter((m) => m.accountId !== me.id && teamsEnabledFor(m.accountId))
        .map((m) => ({
          accountId: m.accountId,
          name: m.name,
          role: (m.role === "admin" ? "admin" : "member") as "admin" | "member",
        })),
    ];
    return {
      /** Whether this account can have a team at all (rollout gate). */
      enabled: teamsEnabledFor(context.account.accountId),
      current: context.account.accountId,
      role: context.account.role,
      accounts,
    };
  }),

  /** People on the active account, its pending invitations, and seats. */
  members: protectedProcedure.handler(async ({ context }) => {
    const { accountId, role } = context.account;
    if (!teamsEnabledFor(accountId)) throw new ORPCError("FORBIDDEN");
    const org = await orgOf(accountId);
    const limit = await getSeatLimit(accountId);

    if (!org) {
      // No team yet: the owner alone. The org is created on first invite.
      const [owner] = await db
        .select({ name: user.name, email: user.email, image: user.image })
        .from(user)
        .where(eq(user.id, accountId));
      return {
        members: owner
          ? [{ id: null, userId: accountId, role: "owner", ...owner }]
          : [],
        invitations: [],
        seats: { used: 1, limit },
      };
    }

    const people = await db
      .select({
        id: member.id,
        userId: member.userId,
        role: member.role,
        name: user.name,
        email: user.email,
        image: user.image,
      })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, org.id))
      .orderBy(asc(member.createdAt));

    const pending = await db
      .select({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
      })
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, org.id),
          eq(invitation.status, "pending"),
        ),
      );
    const live = pending.filter((i) => i.expiresAt.getTime() > Date.now());

    return {
      members: people,
      // Emails of people not on the team yet: admins and the owner only.
      invitations: can(role, "member.manage")
        ? live.map((i) => ({ ...i, expiresAt: i.expiresAt.toISOString() }))
        : [],
      seats: { used: people.length + live.length, limit },
    };
  }),

  invite: accountProcedure("member.manage")
    .input(z.object({ email: z.string().trim().toLowerCase().email(), role: inviteRole }))
    .handler(async ({ context, input }) => {
      const { accountId } = context.account;
      if (!teamsEnabledFor(accountId)) throw new ORPCError("FORBIDDEN");
      if (input.email === context.session.user.email.toLowerCase()) {
        throw new ORPCError("BAD_REQUEST", { message: "That's you." });
      }
      let org = await orgOf(accountId);
      if (!org) {
        // First invite from a solo account: create its team, owned by the
        // account. Only the owner can get here (admins exist only in a team).
        const [owner] = await db
          .select({ name: user.name, email: user.email })
          .from(user)
          .where(eq(user.id, accountId));
        const created = await rethrow(
          auth.api.createOrganization({
            body: {
              userId: accountId,
              name: owner?.name || owner?.email || "My team",
              slug: accountId.toLowerCase(),
              ownerUserId: accountId,
              keepCurrentActiveOrganization: true,
            },
          }),
        );
        if (!created) throw new ORPCError("INTERNAL_SERVER_ERROR");
        org = { id: created.id, name: created.name };
      }
      await rethrow(
        auth.api.createInvitation({
          headers: context.headers,
          body: {
            email: input.email,
            role: input.role,
            organizationId: org.id,
            resend: true,
          },
        }),
      );
      return { success: true };
    }),

  setRole: accountProcedure("member.manage")
    .input(z.object({ memberId: z.string(), role: inviteRole }))
    .handler(async ({ context, input }) => {
      const org = await requireOrg(context.account.accountId);
      await rethrow(
        auth.api.updateMemberRole({
          headers: context.headers,
          body: { memberId: input.memberId, role: input.role, organizationId: org.id },
        }),
      );
      return { success: true };
    }),

  remove: accountProcedure("member.manage")
    .input(z.object({ memberId: z.string() }))
    .handler(async ({ context, input }) => {
      const org = await requireOrg(context.account.accountId);
      await rethrow(
        auth.api.removeMember({
          headers: context.headers,
          body: { memberIdOrEmail: input.memberId, organizationId: org.id },
        }),
      );
      return { success: true };
    }),

  cancelInvitation: accountProcedure("member.manage")
    .input(z.object({ invitationId: z.string() }))
    .handler(async ({ context, input }) => {
      await requireOrg(context.account.accountId);
      await rethrow(
        auth.api.cancelInvitation({
          headers: context.headers,
          body: { invitationId: input.invitationId },
        }),
      );
      return { success: true };
    }),

  /** Switch the session to one's own account or a team account. */
  setActive: protectedProcedure
    .input(z.object({ accountId: z.string() }))
    .handler(async ({ context, input }) => {
      const me = context.session.user.id;
      let organizationId: string | null = null;
      if (input.accountId !== me) {
        const org = await orgOf(input.accountId);
        const membership = org && (await findMembership(me, org.id));
        if (!org || !membership || !teamsEnabledFor(input.accountId)) {
          throw new ORPCError("NOT_FOUND", { message: "Account not found" });
        }
        organizationId = org.id;
      }
      await rethrow(
        auth.api.setActiveOrganization({
          headers: context.headers,
          body: { organizationId },
        }),
      );
      return { success: true };
    }),
};
