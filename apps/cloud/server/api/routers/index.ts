import { protectedProcedure, publicProcedure } from "../lib/orpc.js";
import { adminRouter } from "./admin.js";
import { apiKeyRouter } from "./api-key.js";
import { bucketRouter } from "./bucket.js";
import { billingRouter, usageRouter } from "./usage.js";

export const appRouter = {
  healthCheck: publicProcedure.handler(() => {
    return "OK";
  }),
  privateData: protectedProcedure.handler(({ context }) => {
    return {
      message: "This is private",
      user: context.session?.user,
    };
  }),
  bucket: bucketRouter,
  apiKey: apiKeyRouter,
  usage: usageRouter,
  billing: billingRouter,
  // Only reachable by ADMIN_USER_ID (see adminProcedure); apps/admin is its
  // only client.
  admin: adminRouter,
};
export type AppRouter = typeof appRouter;
