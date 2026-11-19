// API keys belong to the account, not to whoever minted them: referenceId is
// the account id (the owner's user id), so routes/tenant.ts resolves every
// key to the owner's storage and a key keeps working after its creator leaves
// the team. Read and changed straight off the table, since better-auth's own
// list/update/delete endpoints only reach the caller's personal keys.

import { and, eq } from "drizzle-orm";
import { db } from "../../shared/db/index.js";
import { apikey } from "../../shared/db/schema/auth.js";
import { bucketIdOf } from "./bucket.js";

/** better-auth stores apikey.metadata as a JSON string; drizzle hands it back raw. */
export function parseMetadata(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function listAccountKeys(accountId: string) {
  const rows = await db
    .select({
      id: apikey.id,
      name: apikey.name,
      start: apikey.start,
      enabled: apikey.enabled,
      metadata: apikey.metadata,
      createdAt: apikey.createdAt,
      expiresAt: apikey.expiresAt,
      lastRequest: apikey.lastRequest,
      requestCount: apikey.requestCount,
    })
    .from(apikey)
    .where(eq(apikey.referenceId, accountId));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    start: row.start,
    enabled: row.enabled ?? false,
    bucketId: bucketIdOf(parseMetadata(row.metadata)),
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    lastRequest: row.lastRequest?.toISOString() ?? null,
    requestCount: row.requestCount ?? 0,
  }));
}

const ownKey = (accountId: string, keyId: string) =>
  and(eq(apikey.id, keyId), eq(apikey.referenceId, accountId));

export async function setAccountKeyEnabled(
  accountId: string,
  keyId: string,
  enabled: boolean,
): Promise<void> {
  await db
    .update(apikey)
    .set({ enabled, updatedAt: new Date() })
    .where(ownKey(accountId, keyId));
}

export async function deleteAccountKey(
  accountId: string,
  keyId: string,
): Promise<void> {
  await db.delete(apikey).where(ownKey(accountId, keyId));
}

/** Every key pinned to one bucket, whoever on the team minted it. */
export async function deleteBucketKeys(
  accountId: string,
  bucketId: string,
): Promise<void> {
  for (const key of await listAccountKeys(accountId)) {
    if (key.bucketId === bucketId) await deleteAccountKey(accountId, key.id);
  }
}
