import { z } from "zod";
import { captureEvent } from "../lib/analytics.js";
import { auth } from "../lib/auth.js";
import {
  deleteAccountKey,
  listAccountKeys,
  setAccountKeyEnabled,
} from "../lib/api-keys.js";
import { assertOwnsBucket } from "../lib/bucket.js";
import { accountProcedure } from "./orpc.js";

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
 * in routes/tenant.ts) - `bucketId` stays nullable here to describe them.
 */
type ApiKeySummary = {
  id: string;
  name: string | null;
  start: string | null;
  enabled: boolean;
  bucketId: string | null;
  expiresAt: string | null;
  createdAt: string;
  lastRequest: string | null;
};

export const apiKeyRouter = {
  list: accountProcedure("apiKey.manage").handler(
    async ({ context }): Promise<ApiKeySummary[]> =>
      (await listAccountKeys(context.account.accountId)).map(
        ({ requestCount: _, ...key }) => key,
      ),
  ),

  create: accountProcedure("apiKey.manage")
    .input(
      z.object({
        name: z.string().trim().min(1).max(32),
        bucketId: z.string().min(1),
        // The plugin rejects anything above 365 days by default.
        expiresInDays: z.number().int().min(1).max(365),
      }),
    )
    .handler(async ({ context, input }) => {
      const { accountId } = context.account;
      await assertOwnsBucket(accountId, input.bucketId);
      // Server-side, on the account's id: the key belongs to the account and
      // keeps working after whoever minted it leaves (lib/api-keys.ts).
      const created = await auth.api.createApiKey({
        body: {
          userId: accountId,
          name: input.name,
          expiresIn: input.expiresInDays * DAY_SECONDS,
          metadata: {
            bucketId: input.bucketId,
            createdBy: context.session.user.id,
          },
        },
      });
      // The Get started checklist's "Connect your app".
      await captureEvent("api_key_created", context.session.user.id, {
        expires_in_days: input.expiresInDays,
      });
      // The only time the plaintext key is ever readable.
      return { key: created.key };
    }),

  setEnabled: accountProcedure("apiKey.manage")
    .input(z.object({ keyId: z.string(), enabled: z.boolean() }))
    .handler(async ({ context, input }) => {
      await setAccountKeyEnabled(
        context.account.accountId,
        input.keyId,
        input.enabled,
      );
      return { success: true };
    }),

  delete: accountProcedure("apiKey.manage")
    .input(z.object({ keyId: z.string() }))
    .handler(async ({ context, input }) => {
      await deleteAccountKey(context.account.accountId, input.keyId);
      return { success: true };
    }),
};
