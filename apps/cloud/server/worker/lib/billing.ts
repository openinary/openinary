import {
  CREDIT_FEATURE_ID,
  type Credits,
  CREDITS_PER_USD,
  FEATURE_IDS,
  FEATURES,
  type FeatureId,
  PLANS,
  type PlanId,
  STORAGE_DAYS_FEATURE_ID,
  UPGRADE_PLAN,
  planOf,
} from "@openinary/plans";
import {
  autumn,
  type CustomerData,
  ensureCustomer,
} from "../../shared/autumn.js";
import { planSettingsUrl } from "../config.js";

export { UPGRADE_PLAN };

/** True if the account has at least `requiredBalance` left on `featureId`. */
export async function checkFeature(
  userId: string,
  featureId: FeatureId,
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
  featureId: FeatureId,
  data?: CustomerData,
): Promise<{ remaining: number; unlimited: boolean }> {
  try {
    const { features } = await getUsage(userId, data);
    const { remaining, unlimited } = features[featureId];
    return { remaining, unlimited };
  } catch (error) {
    console.error("%s", `Failed to read ${featureId} balance for ${userId}`, error);
    return { remaining: Number.POSITIVE_INFINITY, unlimited: false };
  }
}

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
  /**
   * The base price this account actually pays, read off its subscription
   * rather than the catalog: an account still on an older plan version (the
   * $0 Alpha) must not be shown the current $5.
   */
  monthlyUsd: number;
  /**
   * The usage credit balance in dollars, on plans that spend from one (Pay as
   * you go). Null on Free and on older plan versions with per-feature grants.
   */
  credits: (Credits & { resetsAt: number | null }) | null;
  features: Record<FeatureId, FeatureUsage>;
};

/** Every consumable that draws on usage_credits, storage held by the day included. */
const CREDIT_METERED = [
  ...FEATURE_IDS.filter((id) => id !== "storage_mb"),
  STORAGE_DAYS_FEATURE_ID,
];

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

  const creditBalance = customer.balances[CREDIT_FEATURE_ID];
  const credits = creditBalance
    ? {
        grantedUsd: creditBalance.granted / CREDITS_PER_USD,
        usedUsd: Math.max(0, creditBalance.usage) / CREDITS_PER_USD,
        resetsAt: creditBalance.nextResetAt ?? null,
      }
    : null;

  // On a credit plan the consumables have no balance of their own: they draw
  // on usage_credits. What each one used this period comes from the event
  // log instead, one call, only for those accounts.
  const periodUsed =
    credits && subscription?.currentPeriodStart
      ? await usedSince(userId, subscription.currentPeriodStart)
      : {};

  const features = {} as Record<FeatureId, FeatureUsage>;
  for (const featureId of FEATURE_IDS) {
    const balance = customer.balances[featureId];
    features[featureId] = balance
      ? {
          granted: balance.granted,
          // Negative when a balance was credited past its grant (a manual
          // top-up, or deletes refunded after a reset). Nothing was used.
          used: Math.max(0, balance.usage),
          remaining: balance.remaining,
          unlimited: balance.unlimited,
          resetsAt: balance.nextResetAt ?? null,
        }
      : credits
        ? {
            // Billed from the credit, never capped: reads as unlimited so the
            // usage meter never blocks it (usage-meter.ts).
            granted: 0,
            used: periodUsed[featureId] ?? 0,
            remaining: 0,
            unlimited: true,
            resetsAt: credits.resetsAt,
          }
        : {
            granted: 0,
            used: 0,
            remaining: 0,
            unlimited: false,
            resetsAt: null,
          };
  }

  const planPrice = subscription?.plan?.price;
  return {
    planId: subscription?.planId ?? null,
    planName: subscription?.plan?.name ?? null,
    cancelsAt: subscription?.canceledAt
      ? (subscription.expiresAt ?? subscription.currentPeriodEnd)
      : null,
    renewsAt: subscription?.currentPeriodEnd ?? null,
    // null = the base price was removed for this customer (a comp, grantPlan).
    monthlyUsd:
      planPrice === null
        ? 0
        : planPrice?.interval === "month"
          ? planPrice.amount
          : planOf(subscription?.planId).monthlyUsd,
    credits,
    features,
  };
}

/** Units each credit-metered feature used since `start`, from the event log. */
async function usedSince(
  userId: string,
  start: number,
): Promise<Partial<Record<string, number>>> {
  try {
    const { list } = await autumn.events.aggregate({
      customerId: userId,
      featureId: CREDIT_METERED,
      customRange: { start, end: Date.now() },
      binSize: "day",
    });
    const totals: Record<string, number> = {};
    for (const bin of list) {
      for (const [id, value] of Object.entries(bin.values)) {
        totals[id] = (totals[id] ?? 0) + (value ?? 0);
      }
    }
    return totals;
  } catch (error) {
    // The credit balance is the bill; the per-feature split is only display.
    console.error("%s", `Failed to aggregate usage for ${userId}`, error);
    return {};
  }
}

/**
 * Bills one day of storage to every paid account: its current footprint in
 * MB, once, under storage_mb_days, which draws on usage_credits. Free is
 * skipped: it has a hard cap and no credit to bill.
 *
 * ponytail: Autumn's track has no idempotency key, so this relies on the
 * daily cron firing once; a manual re-run the same day double-bills a day of
 * storage (cents). Add a per-day KV marker if it is ever re-run by hand.
 */
export async function meterStorageDay(userIds: string[]): Promise<void> {
  for (const userId of userIds) {
    try {
      const { credits, features } = await getUsage(userId);
      const mb = features.storage_mb.used;
      if (!credits || mb <= 0) continue;
      await autumn.track({
        customerId: userId,
        featureId: STORAGE_DAYS_FEATURE_ID,
        value: mb,
      });
    } catch (error) {
      console.error("%s", `Failed to meter storage for ${userId}`, error);
    }
  }
}

type QuotaError = {
  error: string;
  code: "quota_exceeded";
  feature: FeatureId;
  plan: string;
  planUrl?: string;
};

/**
 * The wording behind every 402. Plan-aware on purpose: Free is hard-blocked
 * and should be told what lifts the limit, while a paid account that somehow
 * lands here (overage off, payment failed) must never be told to buy what it
 * already pays for. Pure so the two branches can be asserted - see
 * billing.test.ts.
 */
export function quotaErrorBody(
  featureId: FeatureId,
  planId: string | null,
  planName: string | null,
): QuotaError {
  const { label, resets } = FEATURES.find((f) => f.id === featureId)!;
  const plan = planName ?? PLANS.free.name;
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
    planUrl: planSettingsUrl,
  };
}

/**
 * Same body, resolving the plan first. One extra Autumn read, only ever on
 * the refusal path; if it fails we fall back to the Free wording, which is
 * the plan every account starts on.
 */
export async function quotaError(
  userId: string,
  featureId: FeatureId,
  data?: CustomerData,
): Promise<QuotaError> {
  const { planId, planName } = await getUsage(userId, data).catch(() => ({
    planId: null,
    planName: null,
  }));
  return quotaErrorBody(featureId, planId, planName);
}

/** Enforced here rather than as an Autumn balance: see PLANS in @openinary/plans. */
export async function getBucketLimit(
  userId: string,
  data?: CustomerData,
): Promise<number> {
  const { planId } = await getUsage(userId, data);
  return planOf(planId).buckets;
}

/** People allowed on the account, owner included: see PLANS in @openinary/plans. */
export async function getSeatLimit(
  userId: string,
  data?: CustomerData,
): Promise<number> {
  const { planId } = await getUsage(userId, data);
  return planOf(planId).seats;
}

/**
 * Starts checkout for UPGRADE_PLAN. redirectMode "always" on purpose: with
 * "if_required" a customer who already has a card on file gets charged inline,
 * which means 10-20s of a dead button and a subscription that appears without
 * anyone confirming a price. Always sending them to Stripe keeps every
 * activation (and, via the portal, every cancellation) on Stripe's own pages.
 *
 * The plan is deliberately *not* enabled before checkout completes: enabling
 * it early would hand out the larger allowance and pay as you go to anyone who
 * opens the page and walks away, with nothing paid and no card on file.
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
    // The $5 base price already makes Stripe collect a card, but Stripe skips
    // it whenever the total due is zero (a 100% coupon, a comped price). The
    // card also pays the overage, so demand it explicitly rather than relying
    // on Stripe's default.
    checkoutSessionParams: { payment_method_collection: "always" },
  });
  return paymentUrl;
}

// --- admin panel (see rpc/admin.ts) ---

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
 * Daily consumption of the features that reset monthly, from `start` until
 * now: what the billing page draws its spend curve from. storage_mb is left
 * out on purpose: it is cumulative and goes down on deletes, so its daily sums
 * are net changes, not consumption; storage_mb_days, the MB-days billed on Pay
 * as you go, is in. Bins are UTC days (autumn-js 1.2.43 has no
 * timezone option), and values are units, not money.
 */
export async function getUsageHistory(
  userId: string,
  start: number,
): Promise<{ day: number; values: Partial<Record<string, number>> }[]> {
  const { list } = await autumn.events.aggregate({
    customerId: userId,
    // storage_mb_days too: on Pay as you go storage is billed by the day.
    featureId: CREDIT_METERED,
    customRange: { start, end: Date.now() },
    binSize: "day",
  });
  return list.map((bin) => ({ day: bin.period, values: bin.values }));
}

/**
 * The card on file, for the plan card. Autumn hands back Stripe's own
 * PaymentMethod object untyped, so this reads it defensively: anything but a
 * card (Link, SEPA, bank account) comes back as just its type.
 */
export async function getPaymentMethod(
  userId: string,
): Promise<{
  type: string;
  brand: string | null;
  last4: string | null;
} | null> {
  const customer = await autumn.customers.get({
    customerId: userId,
    expand: ["payment_method"],
  });
  const method = customer.paymentMethod as
    | { type?: string; card?: { brand?: string; last4?: string } }
    | null
    | undefined;
  if (!method?.type) return null;
  return {
    type: method.type,
    brand: method.card?.brand ?? null,
    last4: method.card?.last4 ?? null,
  };
}

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
 * works here. "always" (what startUpgradeCheckout uses) would send the person to
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
 * A plan with a base price ($5 for Pay as you go) would still not start: Autumn
 * opens a $5 invoice and waits for it to be paid. `customize.price: null` drops
 * the base price for this one customer, so the plan starts at once, with its
 * credits and no invoice. Overage past the credits can't be collected either,
 * since there is no card on file. That is what comping a plan means.
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
    ...(PLANS[planId as PlanId]?.monthlyUsd && { customize: { price: null } }),
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

const BYTES_PER_MB = 1024 * 1024;

/**
 * The whole megabytes to bill when `delta` bytes are added to (or, negative,
 * removed from) a running total of `total`: the change in the rounded total.
 * Summed over any sequence of changes, it telescopes to the rounding of their
 * sum, which is what keeps per-file and per-batch rounding from drifting.
 */
export function storageMbDelta(total: number, delta: number): number {
  return (
    Math.round((total + delta) / BYTES_PER_MB) -
    Math.round(total / BYTES_PER_MB)
  );
}

/** What a check against storage_mb asks for, for an upload of `bytes`. */
export function megabytes(bytes: number): number {
  return Math.round(bytes / BYTES_PER_MB);
}
