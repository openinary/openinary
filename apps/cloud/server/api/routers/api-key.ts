import { z } from "zod";
import { auth } from "../lib/auth.js";
import { assertOwnsBucket } from "../lib/bucket.js";
import { protectedProcedure } from "../lib/orpc.js";

const DAY_SECONDS = 24 * 60 * 60;

/**
 * Every new key is scoped to exactly one bucket (`bucketId` in its metadata).
 * The choice is made once, at creation - re-scoping a live key would silently
 * repoint every integration already using it.
 *
 * Account-wide keys are no longer issued: they followed whichever bucket the
 * dashboard had marked active, so merely clicking another bucket in the UI
 * silently changed where a production integration wrote. Keys minted before
 * this still carry no metadata and keep that behaviour (see applySessionTenant
 * in worker/app.ts) - `bucketId` stays nullable here to describe them.
 */
export type ApiKeySummary = {
  id: string;
  name: string | null;
  start: string | null;
  enabled: boolean;
  bucketId: string | null;
  expiresAt: string | null;
  createdAt: string;
  lastRequest: string | null;
};

/** better-auth stores metadata as a JSON string but hands it back parsed. */
export function bucketIdOf(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>).bucketId;
  return typeof value === "string" ? value : null;
}

export const apiKeyRouter = {
  list: protectedProcedure.handler(
    async ({ context }): Promise<ApiKeySummary[]> => {
      const { apiKeys } = await auth.api.listApiKeys({
        headers: context.headers,
      });
      return apiKeys.map((key) => ({
        id: key.id,
        name: key.name,
        start: key.start,
        enabled: key.enabled,
        bucketId: bucketIdOf(key.metadata),
        expiresAt: key.expiresAt?.toISOString() ?? null,
        createdAt: key.createdAt.toISOString(),
        lastRequest: key.lastRequest?.toISOString() ?? null,
      }));
    },
  ),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(32),
        bucketId: z.string().min(1),
        // The plugin rejects anything above 365 days by default.
        expiresInDays: z.number().int().min(1).max(365),
      }),
    )
    .handler(async ({ context, input }) => {
      await assertOwnsBucket(context.session.user.id, input.bucketId);
      const created = await auth.api.createApiKey({
        headers: context.headers,
        body: {
          name: input.name,
          expiresIn: input.expiresInDays * DAY_SECONDS,
          metadata: { bucketId: input.bucketId },
        },
      });
      // The only time the plaintext key is ever readable.
      return { key: created.key };
    }),

  setEnabled: protectedProcedure
    .input(z.object({ keyId: z.string(), enabled: z.boolean() }))
    .handler(async ({ context, input }) => {
      await auth.api.updateApiKey({
        headers: context.headers,
        body: { keyId: input.keyId, enabled: input.enabled },
      });
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ keyId: z.string() }))
    .handler(async ({ context, input }) => {
      await auth.api.deleteApiKey({
        headers: context.headers,
        body: { keyId: input.keyId },
      });
      return { success: true };
    }),
};
