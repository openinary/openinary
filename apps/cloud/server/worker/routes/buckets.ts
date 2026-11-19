// DELETE /buckets/:bucketId. Not an oRPC procedure like the rest of bucket
// CRUD because the sweep needs the R2 binding, which the routers can't name
// (see bindings.ts).

import { tenantRootFor } from "../../shared/tenant.js";
import { deleteTenant } from "../assets.js";
import { can, resolveAccount } from "../lib/account.js";
import { deleteBucketKeys } from "../lib/api-keys.js";
import { auth } from "../lib/auth.js";
import { deleteBucket, listBuckets } from "../lib/bucket.js";
import { meterFor } from "../lib/meter.js";
import { forgetBuckets } from "../owner-cache.js";
import type { App } from "./tenant.js";

export function bucketRoutes(app: App): void {
  /**
   * Destroys one bucket and everything under it. Deliberately outside
   * "/storage/*" so it never picks up requireTenant: that middleware also
   * accepts API keys, and a media key must never be able to delete a bucket.
   * It also resolves the *active* bucket, while the target here comes from
   * the path.
   */
  app.delete("/buckets/:bucketId", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) return c.json({ error: "Unauthorized" }, 401);
    const account = await resolveAccount(session);
    if (!can(account.role, "bucket.manage"))
      return c.json({ error: "Forbidden" }, 403);
    const userId = account.accountId;
    const bucketId = c.req.param("bucketId");

    const buckets = await listBuckets(userId);
    if (!buckets.some((b) => b.id === bucketId))
      return c.json({ error: "Not found", message: "Bucket not found" }, 404);
    if (buckets.length === 1)
      return c.json(
        { error: "Bad request", message: "You can't delete your only bucket" },
        400,
      );

    const bytes = await deleteTenant(
      c.env.MEDIA_BUCKET,
      tenantRootFor(userId, bucketId),
    );

    // Keys pinned to this bucket would otherwise keep authenticating while
    // writing into a prefix nothing can read back. Every key on the account,
    // whoever on the team minted it.
    await deleteBucketKeys(userId, bucketId);

    await deleteBucket(userId, bucketId);
    const meter = meterFor(c.env.USAGE_METER, userId);
    // The meter first, so its next flush can't write the bucket back into
    // the owner cache right after it was dropped.
    await meter.forgetBucket(bucketId);
    await forgetBuckets(c.env.BUCKET_OWNERS, [bucketId]);
    c.executionCtx.waitUntil(
      meter.trackStorage(
        -bytes,
        account.memberId
          ? {}
          : { name: session.user.name, email: session.user.email },
      ),
    );
    return c.body(null, 204);
  });
}
