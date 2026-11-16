import type { FeatureId } from "@openinary/plans";
import { Autumn } from "autumn-js";

export const autumn = new Autumn({ secretKey: process.env.AUTUMN_SECRET_KEY });

export type CustomerData = { name?: string | null; email?: string | null };

// check/track/batchTrack all 404 on an unknown customer_id - getOrCreate is
// the only call that auto-attaches the org's auto_enable plan ("free"), so
// every metering call goes through this first. Idempotent on Autumn's side,
// so calling it before every check/track is correct, not just cheap. Also
// keeps name/email in sync on Autumn's dashboard whenever a caller has them.
//
// Exported because the admin panel calls it on its own, when creating an
// account off the waitlist: that auto-attach is what puts the new account on
// the free plan, and doing it there means the account reads as "Free" from the
// moment it exists rather than the first time something meters it.
export async function ensureCustomer(
  userId: string,
  data?: CustomerData,
): Promise<void> {
  await autumn.customers.getOrCreate({ customerId: userId, ...data });
}

/** Records usage; negative values credit balance back (e.g. on delete). */
export async function trackFeature(
  userId: string,
  featureId: FeatureId,
  value: number,
  data?: CustomerData,
): Promise<void> {
  if (value === 0) return;
  await ensureCustomer(userId, data);
  await autumn.track({ customerId: userId, featureId, value });
}

// No batchTrackFeature wrapper: autumn-js 1.2.43's batchTrack only matches a
// 202 response, while /v1/balances.batch_track actually answers 200
// {"success":true}, so every call throws AutumnDefaultError regardless of
// payload. track() matches both statuses - loop it instead (see
// meterCompletedVideoJobs in worker/cron.ts). Revisit if a caller ever has
// enough items for the round trips to matter.
