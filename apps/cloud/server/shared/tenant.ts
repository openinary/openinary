// The storage layout of one customer bucket: every original, derivative,
// video_job and media_duration row of a bucket sits under
// "ugc/{userId}/{bucketId}". This is the only place that builds or reads it.

const ROOT = "ugc";

/** Storage prefix every media route scopes to. */
export function tenantRootFor(userId: string, bucketId: string): string {
  return `${ROOT}/${userId}/${bucketId}`;
}

/** Prefix of every bucket one account owns. */
export function accountRootFor(userId: string): string {
  return `${ROOT}/${userId}`;
}

/** Splits a full path ("ugc/{userId}/{bucketId}/...") back into its owner. */
export function parseTenantPath(
  fullPath: string,
): { userId: string; bucketId: string; path: string } | null {
  const [root, userId, bucketId, ...rest] = fullPath.split("/");
  if (root !== ROOT || !userId || !bucketId) return null;
  return { userId, bucketId, path: rest.join("/") };
}
