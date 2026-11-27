// The coding agents a person connected through the MCP server (worker/mcp/),
// for the Cloud Home. A connection is that person's consent to an OAuth
// client, on the account the dashboard had active when they gave it.

import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../shared/db/index.js";
import {
  oauthClient,
  oauthConsent,
  oauthRefreshToken,
} from "../../shared/db/schema/auth.js";
import { protectedProcedure } from "./orpc.js";

type Session = {
  user: { id: string };
  session: { activeOrganizationId?: string | null };
};

/** Consents and tokens given on the account this session is looking at. */
const onActiveAccount = (
  column:
    | typeof oauthConsent.referenceId
    | typeof oauthRefreshToken.referenceId,
  session: Session,
) => {
  const org = session.session.activeOrganizationId;
  return org ? eq(column, org) : isNull(column);
};

export const agentRouter = {
  list: protectedProcedure.handler(async ({ context }) => {
    const rows = await db
      .select({
        clientId: oauthConsent.clientId,
        name: oauthClient.name,
        connectedAt: oauthConsent.createdAt,
      })
      .from(oauthConsent)
      .innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
      .where(
        and(
          eq(oauthConsent.userId, context.session.user.id),
          onActiveAccount(oauthConsent.referenceId, context.session),
        ),
      )
      .orderBy(desc(oauthConsent.createdAt));
    return rows.map((row) => ({
      clientId: row.clientId,
      name: row.name || "An agent",
      connectedAt: row.connectedAt.toISOString(),
    }));
  }),

  /**
   * Forgets the consent and revokes the refresh tokens, so the agent has to
   * ask again. An access token already issued stays valid until it expires
   * (an hour at most): they are signed JWTs, checked without a lookup.
   */
  disconnect: protectedProcedure
    .input(z.object({ clientId: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;
      await db
        .update(oauthRefreshToken)
        .set({ revoked: new Date() })
        .where(
          and(
            eq(oauthRefreshToken.userId, userId),
            eq(oauthRefreshToken.clientId, input.clientId),
            onActiveAccount(oauthRefreshToken.referenceId, context.session),
            isNull(oauthRefreshToken.revoked),
          ),
        );
      await db
        .delete(oauthConsent)
        .where(
          and(
            eq(oauthConsent.userId, userId),
            eq(oauthConsent.clientId, input.clientId),
            onActiveAccount(oauthConsent.referenceId, context.session),
          ),
        );
    }),
};
