import { ORPCError, os } from "@orpc/server";
import type { Context } from "./context.js";

export const o = os.$context<Context>();

export const publicProcedure = o;

const requireAuth = o.middleware(async ({ context, next }) => {
  if (!context.session?.user) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return next({
    context: {
      session: context.session,
    },
  });
});

export const protectedProcedure = publicProcedure.use(requireAuth);

/**
 * The admin panel's gate (apps/admin). Same single env var better-auth's admin
 * plugin is configured with (`adminUserIds` in lib/auth.ts), so the oRPC
 * procedures and the `auth.api.*` admin endpoints they call can never disagree
 * about who is allowed in.
 *
 * Unset ADMIN_USER_ID refuses everyone: a deployment that forgot the variable
 * must not end up with an open admin surface.
 */
const requireAdmin = o.middleware(async ({ context, next }) => {
  const adminUserId = process.env.ADMIN_USER_ID;
  if (!adminUserId || context.session?.user.id !== adminUserId) {
    throw new ORPCError("FORBIDDEN");
  }
  return next({ context: { session: context.session } });
});

export const adminProcedure = protectedProcedure.use(requireAdmin);
