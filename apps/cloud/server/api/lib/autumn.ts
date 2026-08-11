import { Autumn } from "autumn-js";

export const autumn = new Autumn({ secretKey: process.env.AUTUMN_SECRET_KEY });

export const USAGE_FEATURE_IDS = [
  "storage_mb",
  "image_transformations",
  "video_processing_seconds",
  "cdn_requests",
] as const;
export type UsageFeatureId = (typeof USAGE_FEATURE_IDS)[number];

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

/** True if the account has at least `requiredBalance` left on `featureId`. */
export async function checkFeature(
  userId: string,
  featureId: UsageFeatureId,
  requiredBalance = 1,
  data?: CustomerData,
): Promise<boolean> {
  await ensureCustomer(userId, data);
  const { allowed } = await autumn.check({
    customerId: userId,
    featureId,
    requiredBalance,
  });
  return allowed;
}

/**
 * What's left on one feature, for callers that need the distance to the cap
 * rather than a yes/no. UsageMeter's alarm uses it to decide both whether to
 * block the account and how soon to flush again, which is one Autumn round
 * trip where checkFeature would answer only the first question.
 *
 * Errs open on failure: an Autumn outage must not blanket-block paying
 * accounts, and the next alarm re-reads it a minute later.
 */
export async function getFeatureBalance(
  userId: string,
  featureId: UsageFeatureId,
  data?: CustomerData,
): Promise<{ remaining: number; unlimited: boolean }> {
  try {
    const { features } = await getUsage(userId, data);
    const { remaining, unlimited } = features[featureId];
    return { remaining, unlimited };
  } catch (error) {
    console.error(`Failed to read ${featureId} balance for ${userId}`, error);
    return { remaining: Number.POSITIVE_INFINITY, unlimited: false };
  }
}

/** Records usage; negative values credit balance back (e.g. on delete). */
export async function trackFeature(
  userId: string,
  featureId: UsageFeatureId,
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
// meterCompletedVideoJobs in worker/index.ts). Revisit if a caller ever has
// enough items for the round trips to matter.

export type FeatureUsage = {
  granted: number;
  used: number;
  remaining: number;
  unlimited: boolean;
  /**
   * When this balance next refills. Null for allowances that don't reset -
   * storage is cumulative, so it never gets one - which is what lets the UI
   * tell "resets monthly" apart from "counts forever" without hardcoding
   * which feature is which. Comes straight from the balance rather than the
   * subscription: a Free account has allowances that reset on schedule
   * whether or not Autumn reports a billing period for it.
   */
  resetsAt: number | null;
};
export type UsageSummary = {
  planId: string | null;
  planName: string | null;
  /**
   * Set only when the subscription is cancelled but still running: the plan
   * stays active until this timestamp, then falls back to free. Null otherwise.
   */
  cancelsAt: number | null;
  /**
   * End of the current billing period - when metered usage is invoiced. Null
   * without a subscription (free) or if Autumn omits it.
   */
  renewsAt: number | null;
  features: Record<UsageFeatureId, FeatureUsage>;
};

/** Plan + per-feature balances for the dashboard usage page. */
export async function getUsage(
  userId: string,
  data?: CustomerData,
): Promise<UsageSummary> {
  const customer = await autumn.customers.getOrCreate({
    customerId: userId,
    ...data,
    expand: ["balances.feature", "subscriptions.plan"],
  });
  const subscription =
    customer.subscriptions.find((s) => !s.addOn) ?? customer.subscriptions[0];

  const features = {} as Record<UsageFeatureId, FeatureUsage>;
  for (const featureId of USAGE_FEATURE_IDS) {
    const balance = customer.balances[featureId];
    features[featureId] = balance
      ? {
          granted: balance.granted,
          used: balance.usage,
          remaining: balance.remaining,
          unlimited: balance.unlimited,
          resetsAt: balance.nextResetAt ?? null,
        }
      : {
          granted: 0,
          used: 0,
          remaining: 0,
          unlimited: false,
          resetsAt: null,
        };
  }

  return {
    planId: subscription?.planId ?? null,
    planName: subscription?.plan?.name ?? null,
    cancelsAt: subscription?.canceledAt
      ? (subscription.expiresAt ?? subscription.currentPeriodEnd)
      : null,
    renewsAt: subscription?.currentPeriodEnd ?? null,
    features,
  };
}

const QUOTA_LABELS: Record<UsageFeatureId, string> = {
  storage_mb: "Storage",
  image_transformations: "Image transformations",
  video_processing_seconds: "Video processing",
  cdn_requests: "CDN delivery",
};

export type QuotaError = {
  error: string;
  code: "quota_exceeded";
  feature: UsageFeatureId;
  plan: string;
  planUrl?: string;
};

/**
 * The plan a Free account upgrades into, and how that upgrade is worded.
 *
 * Cloud is built and priced but not on sale yet, so self-serve upgrades land
 * on Alpha instead (plan id `early_access`, renamed in the Autumn catalog when
 * Cloud went to public alpha): double the Free allowance, $0 base,
 * pay-as-you-go past it. To put Cloud back on sale, switch both fields here and flip
 * CLOUD_AVAILABLE in apps/web/src/lib/usage.ts with them - this decides what
 * checkout attaches, that decides what the UI offers, and they must agree.
 */
export const UPGRADE_PLAN = {
  id: "early_access",
  /** Fills "<cta> to lift this limit" in the 402 copy; the button matches. */
  cta: "Enable pay as you go",
} as const;

/**
 * The wording behind every 402. Plan-aware on purpose: Free is hard-blocked
 * and should be told what lifts the limit, while a paid account that somehow
 * lands here (overage off, payment failed) must never be told to buy what it
 * already pays for. Pure so the two branches can be asserted - see
 * autumn.check.ts.
 */
export function quotaErrorBody(
  featureId: UsageFeatureId,
  planId: string | null,
  planName: string | null,
): QuotaError {
  const label = QUOTA_LABELS[featureId];
  const plan = planName ?? "Free";
  // Storage is cumulative; every other allowance refills each period.
  const resets = featureId !== "storage_mb";
  return {
    error:
      planId && planId !== "free"
        ? `${label} limit reached on the ${plan} plan. Review your usage and billing settings to restore full service.`
        : `${label} limit reached on the Free plan. ${UPGRADE_PLAN.cta} to lift this limit${
            resets ? ", or wait for your monthly allowance to reset" : ""
          }.`,
    code: "quota_exceeded",
    feature: featureId,
    plan,
    planUrl: process.env.CORS_ORIGIN
      ? `${process.env.CORS_ORIGIN}/?settings=plan`
      : undefined,
  };
}

/**
 * Same body, resolving the plan first. One extra Autumn read, only ever on
 * the refusal path; if it fails we fall back to the Free wording, which is
 * the plan every account starts on.
 */
export async function quotaError(
  userId: string,
  featureId: UsageFeatureId,
  data?: CustomerData,
): Promise<QuotaError> {
  const { planId, planName } = await getUsage(userId, data).catch(() => ({
    planId: null,
    planName: null,
  }));
  return quotaErrorBody(featureId, planId, planName);
}

/**
 * How many buckets each plan allows. Deliberately a static map rather than an
 * Autumn feature: a bucket count isn't usage, it's derivable exactly from
 * Postgres at any moment (see listBuckets), so metering it would mean tracking
 * +1/-1 on every create/delete and living with the balance drifting away from
 * the truth the first time a track() call fails. Any plan not listed - and no
 * subscription at all - gets the free allowance.
 *
 * Buckets are the one early_access allowance Autumn doesn't hold, so it's set
 * here by the same rule as the rest of that plan: double Free.
 */
const BUCKET_LIMITS: Record<string, number> = {
  free: 1,
  early_access: 2,
  cloud: 10,
};
const DEFAULT_BUCKET_LIMIT = BUCKET_LIMITS.free;

export async function getBucketLimit(
  userId: string,
  data?: CustomerData,
): Promise<number> {
  const { planId } = await getUsage(userId, data);
  return (planId ? BUCKET_LIMITS[planId] : undefined) ?? DEFAULT_BUCKET_LIMIT;
}

/**
 * Starts checkout for UPGRADE_PLAN. redirectMode "always" on purpose: with
 * "if_required" a customer who already has a card on file gets charged inline,
 * which means 10-20s of a dead button and a subscription that appears without
 * anyone confirming a price. Always sending them to Stripe keeps every
 * activation (and, via the portal, every cancellation) on Stripe's own pages.
 *
 * The plan is deliberately *not* enabled before checkout completes: Early
 * Access costs $0 up front, so enabling it early would hand out the doubled
 * allowance and pay-as-you-go to anyone who opens the page and walks away,
 * with no card to bill the overage to.
 */
export async function startUpgradeCheckout(
  userId: string,
  successUrl?: string,
): Promise<string | null> {
  const { paymentUrl } = await autumn.billing.attach({
    customerId: userId,
    planId: UPGRADE_PLAN.id,
    redirectMode: "always",
    successUrl,
    // Nothing is due today on a $0 base price, and Stripe will happily complete
    // a subscription checkout without asking for a card when the total is zero.
    // That would leave the account on pay-as-you-go with nothing to charge when
    // it goes past the allowance, so demand the card explicitly rather than
    // relying on Stripe's default.
    checkoutSessionParams: { payment_method_collection: "always" },
  });
  return paymentUrl;
}

// --- admin panel (see routers/admin.ts) ---

export type AdminBilling = {
  stripeId: string | null;
  hasPaymentMethod: boolean;
  invoices: {
    planIds: string[];
    status: string;
    total: number;
    currency: string;
    createdAt: number;
    hostedInvoiceUrl: string | null;
  }[];
};

/**
 * The billing facts the customer's own plan tab never shows: invoice history
 * and whether a card is on file. Plan and balances deliberately stay on
 * getUsage above, so the admin reads the same numbers the customer does.
 */
export async function getAdminBilling(userId: string): Promise<AdminBilling> {
  const customer = await autumn.customers.get({
    customerId: userId,
    expand: ["invoices", "payment_method"],
  });
  return {
    stripeId: customer.stripeId ?? null,
    hasPaymentMethod: Boolean(customer.paymentMethod),
    invoices: (customer.invoices ?? []).map((invoice) => ({
      planIds: invoice.planIds,
      status: invoice.status,
      total: invoice.total,
      currency: invoice.currency,
      createdAt: invoice.createdAt,
      hostedInvoiceUrl: invoice.hostedInvoiceUrl ?? null,
    })),
  };
}

/**
 * Puts an account on a plan directly, with no Stripe round trip - how early
 * access is handed out.
 *
 * `redirectMode: "never"` is load-bearing, and neither of the other two values
 * works here. "always" (what startCloudCheckout uses) would send the person to
 * a Stripe page to confirm a price of zero. The default "if_required" looks
 * right and isn't: Autumn routes *any* plan carrying usage-based prices through
 * Stripe Checkout so a card ends up on file, even when the amount due is $0 -
 * and early_access prices overage on all four features, so it does exactly
 * that. Confirmed against Autumn's own attach preview, which answers
 * `total: 0` and `redirect_to_checkout: true` together.
 *
 * Nobody is at a browser to complete that checkout: the whole point is that an
 * admin is granting the plan on someone else's behalf. "never" attaches it
 * server-side instead.
 *
 * The consequence is deliberate and worth stating: the account ends up on the
 * plan with no payment method, so any overage it runs up cannot be collected
 * until they add one. That is what comping a plan means.
 */
export async function grantPlan(
  userId: string,
  planId: string,
  data?: CustomerData,
): Promise<void> {
  await ensureCustomer(userId, data);
  await autumn.billing.attach({
    customerId: userId,
    planId,
    redirectMode: "never",
  });
}

/**
 * Drops the Autumn customer and its Stripe counterpart. Part of deleting an
 * account everywhere; Autumn does not cascade to Stripe unless asked.
 */
export async function deleteCustomer(userId: string): Promise<void> {
  await autumn.customers.delete({
    customerId: userId,
    deleteInStripe: true,
  });
}

/** Stripe billing portal session (manage payment method, invoices, cancellation). */
export async function openBillingPortal(
  userId: string,
  returnUrl?: string,
): Promise<string> {
  const { url } = await autumn.billing.openCustomerPortal({
    customerId: userId,
    returnUrl,
  });
  return url;
}
