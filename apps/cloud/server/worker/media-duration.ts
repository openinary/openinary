// The only module touching media_duration: a video's source length, keyed by
// its full path ("ugc/{userId}/{bucketId}/..."). It is looked up by exact
// match (the quota gate in cdn/serve.ts, the 202 estimate), so every rename,
// move, copy and delete has to carry it along or the video silently drops out
// of quota gating - not an error, just a file that is never gated again.

import { eq, like } from "drizzle-orm";
import { db } from "../shared/db/index.js";
import { mediaDuration } from "../shared/db/schema/media-duration.js";

export async function durationOf(fullPath: string): Promise<number | null> {
  const [row] = await db
    .select({ seconds: mediaDuration.seconds })
    .from(mediaDuration)
    .where(eq(mediaDuration.filePath, fullPath));
  return row?.seconds ?? null;
}

export async function recordDuration(
  fullPath: string,
  seconds: number,
): Promise<void> {
  await db
    .insert(mediaDuration)
    .values({ filePath: fullPath, seconds })
    .onConflictDoUpdate({ target: mediaDuration.filePath, set: { seconds } });
}

export async function copyDuration(from: string, to: string): Promise<void> {
  const seconds = await durationOf(from);
  if (seconds !== null) await recordDuration(to, seconds);
}

/** One file, or (folder: true) everything beneath a folder path. */
export async function moveDuration(
  from: string,
  to: string,
  { folder = false } = {},
): Promise<void> {
  if (!folder) {
    await db
      .update(mediaDuration)
      .set({ filePath: to })
      .where(eq(mediaDuration.filePath, from));
    return;
  }
  const rows = await db
    .select({ filePath: mediaDuration.filePath })
    .from(mediaDuration)
    .where(like(mediaDuration.filePath, `${from}/%`));
  for (const row of rows) {
    await db
      .update(mediaDuration)
      .set({ filePath: to + row.filePath.slice(from.length) })
      .where(eq(mediaDuration.filePath, row.filePath));
  }
}

export async function deleteDuration(fullPath: string): Promise<void> {
  await db.delete(mediaDuration).where(eq(mediaDuration.filePath, fullPath));
}

/** Everything under a folder, bucket or account prefix. */
export async function deleteDurationsUnder(prefix: string): Promise<void> {
  await db
    .delete(mediaDuration)
    .where(like(mediaDuration.filePath, `${prefix}/%`));
}
