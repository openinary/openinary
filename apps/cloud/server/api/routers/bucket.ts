import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { getBucketLimit } from "../lib/autumn.js";
import {
  createBucket,
  listBuckets,
  renameBucket,
  selectBucket,
} from "../lib/bucket.js";
import { protectedProcedure } from "../lib/orpc.js";

const bucketName = z.string().trim().min(1).max(60);

export const bucketRouter = {
  list: protectedProcedure.handler(({ context }) =>
    listBuckets(context.session.user.id),
  ),

  /** Buckets allowed on the caller's plan, and how many are already in use. */
  quota: protectedProcedure.handler(async ({ context }) => {
    const [used, limit] = await Promise.all([
      listBuckets(context.session.user.id).then((b) => b.length),
      getBucketLimit(context.session.user.id, {
        name: context.session.user.name,
        email: context.session.user.email,
      }),
    ]);
    return { used, limit };
  }),

  create: protectedProcedure
    .input(z.object({ name: bucketName }))
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;
      const [buckets, limit] = await Promise.all([
        listBuckets(userId),
        getBucketLimit(userId, {
          name: context.session.user.name,
          email: context.session.user.email,
        }),
      ]);
      // Enforced here rather than as an Autumn balance - see getBucketLimit.
      if (buckets.length >= limit) {
        throw new ORPCError("FORBIDDEN", {
          message: `Your plan includes ${limit} bucket${limit === 1 ? "" : "s"}. Upgrade to add more.`,
        });
      }
      return createBucket(userId, input.name);
    }),

  rename: protectedProcedure
    .input(z.object({ bucketId: z.string(), name: bucketName }))
    .handler(async ({ context, input }) => {
      await renameBucket(context.session.user.id, input.bucketId, input.name);
      return { success: true };
    }),

  select: protectedProcedure
    .input(z.object({ bucketId: z.string() }))
    .handler(async ({ context, input }) => {
      await selectBucket(context.session.user.id, input.bucketId);
      return { success: true };
    }),

  // No `delete` here: the sweep needs the R2/KV bindings, and api/ is a
  // separate TS program from worker/ (see the tsconfigs). Lives at
  // DELETE /buckets/:bucketId in worker/app.ts instead.
};
