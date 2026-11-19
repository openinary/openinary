import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { getBucketLimit } from "../lib/billing.js";
import { bucketsFor, selectBucketFor } from "../lib/account.js";
import { createBucket, listBuckets, renameBucket } from "../lib/bucket.js";
import { accountProcedure, protectedProcedure } from "./orpc.js";
import { customerDataOf } from "./customer.js";

const bucketName = z.string().trim().min(1).max(60);

export const bucketRouter = {
  list: protectedProcedure.handler(({ context }) =>
    bucketsFor(context.account),
  ),

  /** Buckets allowed on the caller's plan, and how many are already in use. */
  quota: protectedProcedure.handler(async ({ context }) => {
    const { accountId } = context.account;
    const [used, limit] = await Promise.all([
      listBuckets(accountId).then((b) => b.length),
      getBucketLimit(accountId, customerDataOf(context)),
    ]);
    return { used, limit };
  }),

  create: accountProcedure("bucket.manage")
    .input(z.object({ name: bucketName }))
    .handler(async ({ context, input }) => {
      const userId = context.account.accountId;
      const [buckets, limit] = await Promise.all([
        listBuckets(userId),
        getBucketLimit(userId, customerDataOf(context)),
      ]);
      // Enforced here rather than as an Autumn balance - see getBucketLimit.
      if (buckets.length >= limit) {
        throw new ORPCError("FORBIDDEN", {
          message: `Your plan includes ${limit} bucket${limit === 1 ? "" : "s"}. Upgrade to add more.`,
        });
      }
      return createBucket(userId, input.name);
    }),

  rename: accountProcedure("bucket.manage")
    .input(z.object({ bucketId: z.string(), name: bucketName }))
    .handler(async ({ context, input }) => {
      await renameBucket(context.account.accountId, input.bucketId, input.name);
      return { success: true };
    }),

  select: protectedProcedure
    .input(z.object({ bucketId: z.string() }))
    .handler(async ({ context, input }) => {
      await selectBucketFor(context.account, input.bucketId);
      return { success: true };
    }),

  // No `delete` here: the sweep needs the R2 binding, which the routers can't
  // name (see context.ts). Lives at DELETE /buckets/:bucketId in
  // routes/buckets.ts instead.
};
