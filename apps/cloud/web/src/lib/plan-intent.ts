// The plan someone picked on openinary.dev ("Start with pay as you go" links
// to /?plan=payg), kept until the onboarding's plan step or Settings › Plan
// has used it. localStorage rather than the URL: a GitHub or Google sign-in
// comes back to the bare origin, and the code-by-email step reloads nothing.

const KEY = "openinary:plan-intent";
const PAID = "payg";

function storage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined; // Storage blocked: the funnel falls back to the plain one.
  }
}

/** Reads ?plan=payg off the current URL and keeps it. */
export function capturePlanIntent() {
  if (new URLSearchParams(window.location.search).get("plan") === PAID) {
    storage()?.setItem(KEY, PAID);
  }
}

/** True when this visitor came from the site's Pay as you go button. */
export const wantsPaidPlan = () => storage()?.getItem(KEY) === PAID;

export const clearPlanIntent = () => storage()?.removeItem(KEY);
