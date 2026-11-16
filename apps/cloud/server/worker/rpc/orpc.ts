import { ORPCError, os } from "@orpc/server";
import { isAdmin } from "../config.js";
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
 * The admin panel's gate (apps/cloud/admin). Same isAdmin as the /admin/* REST
 * routes and better-auth's admin plugin, so none of them can disagree about
 * who is allowed in.
 */
const requireAdmin = o.middleware(async ({ context, next }) => {
  if (!context.session || !isAdmin(context.session.user.id)) {
    throw new ORPCError("FORBIDDEN");
  }
  return next({ context: { session: context.session } });
});

export const adminProcedure = protectedProcedure.use(requireAdmin);
