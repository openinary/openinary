/**
 * Server-side PostHog product events (account created, asset uploaded, ...),
 * distinct from worker/posthog.ts which ships delivery *logs* over OTLP.
 *
 * distinct_id is always the Better Auth user id: the web app calls
 * posthog.identify(user.id) after sign-in, which merges the visitor's
 * anonymous marketing-site journey into the same person. That is what makes
 * the visit -> signup -> first upload funnel readable end to end.
 *
 * Token comes from POSTHOG_PROJECT_TOKEN (a wrangler var, write-only phc_
 * key). Missing token or a failed send degrades to silence: analytics must
 * never cost a signup or an upload.
 *
 * Local dev is deliberately muted. `wrangler dev` loads the same vars block
 * as production, so without this every test signup and test upload would
 * land in the real project and distort the conversion funnel. Same dev/prod
 * split as sendEmail in lib/auth.ts: the event goes to the console instead.
 */
const ENDPOINT = "https://eu.i.posthog.com/i/v0/e/";

function isProduction(): boolean {
  try {
    return new URL(
      process.env.BETTER_AUTH_URL || "http://localhost",
    ).hostname.endsWith(".openinary.dev");
  } catch {
    return false;
  }
}

export async function captureEvent(
  event: string,
  distinctId: string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  const token = process.env.POSTHOG_PROJECT_TOKEN;
  if (!token) return;
  if (!isProduction()) {
    console.log(`[analytics] ${event} for ${distinctId}`, properties);
    return;
  }
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: token,
        event,
        distinct_id: distinctId,
        properties,
      }),
    });
    if (!res.ok) {
      console.error(`PostHog capture rejected (${event}): ${res.status}`);
    }
  } catch (error) {
    console.error(`PostHog capture failed (${event})`, error);
  }
}

/** Standard PostHog campaign properties, in the order the UI lists them. */
const UTM_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
];

/**
 * Signup attribution, read off posthog-js's own cookie.
 *
 * cloud_account_created is captured here, on the server, so it carries none
 * of the $referrer / utm_* properties posthog-js puts on browser events -
 * which is why breaking signups down by referring domain answered None for
 * every single account. The referrer was never lost, it just never reached
 * the event: posthog-js keeps the *first* one it ever saw under
 * $initial_person_info in ph_<token>_posthog, a cookie it scopes to
 * .openinary.dev. So the value written when the visitor landed on the
 * marketing site rides along to every request this auth server sees on
 * cdn.openinary.dev - including Google's OAuth callback, since the cookie is
 * SameSite=Lax and that redirect is a top-level navigation.
 *
 * The cookie's shape ({ r: referrer, u: first URL }, both capped at 1000
 * chars) is posthog-js's internal one, not a documented contract, and it is
 * a request header either way: every step is optional, values are re-capped
 * here, and anything unexpected degrades to no attribution rather than to a
 * failed signup.
 *
 * $set_once mirrors the same values onto the person, which posthog-js would
 * otherwise only do at its next identify() - a call an ad blocker can stop
 * from ever happening, on the exact clients whose origin is most worth
 * knowing.
 */
export function signupAttribution(
  cookieHeader: string | null | undefined,
): Record<string, unknown> {
  const raw = cookieHeader?.match(/(?:^|;\s*)ph_[^=;]+_posthog=([^;]+)/)?.[1];
  if (!raw) return {};
  try {
    const info = JSON.parse(decodeURIComponent(raw))?.$initial_person_info;
    const referrer =
      typeof info?.r === "string" ? info.r.slice(0, 1000) : undefined;
    const url = typeof info?.u === "string" ? info.u.slice(0, 1000) : undefined;

    const props: Record<string, string> = {};
    if (referrer) {
      props.$referrer = referrer;
      // "$direct" is posthog-js's sentinel for "no document.referrer", and it
      // is a domain value in its own right - the share of signups that walked
      // in cold is exactly what the breakdown is being read for.
      props.$referring_domain =
        referrer === "$direct" ? "$direct" : new URL(referrer).host;
    }
    if (url) {
      const params = new URL(url).searchParams;
      for (const param of UTM_PARAMS) {
        const value = params.get(param);
        if (value) props[param] = value;
      }
    }
    if (Object.keys(props).length === 0) return {};

    return {
      ...props,
      $set_once: Object.fromEntries(
        Object.entries(props).map(([key, value]) => [
          `$initial_${key.replace(/^\$/, "")}`,
          value,
        ]),
      ),
    };
  } catch {
    return {};
  }
}
