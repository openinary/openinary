import { publicProcedure } from "./orpc.js";
import { adminRouter } from "./admin.js";
import { apiKeyRouter } from "./api-key.js";
import { bucketRouter } from "./bucket.js";
import { teamRouter } from "./team.js";
import { billingRouter, usageRouter } from "./usage.js";

export const appRouter = {
  healthCheck: publicProcedure.handler(() => {
    return "OK";
  }),
  bucket: bucketRouter,
  apiKey: apiKeyRouter,
  usage: usageRouter,
  billing: billingRouter,
  team: teamRouter,
  // Only reachable by ADMIN_USER_ID (see adminProcedure); apps/cloud/admin is
  // its only client.
  admin: adminRouter,
};
export type AppRouter = typeof appRouter;
