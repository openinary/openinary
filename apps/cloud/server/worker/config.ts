// The Worker's deployment settings, read once. Vars and secrets from
// wrangler.jsonc reach process.env before any module runs (nodejs_compat).

const env = process.env;

/** The customer dashboard (app.openinary.dev): CORS, sign-in, links in emails and 402s. */
export const DASHBOARD_ORIGIN = env.CORS_ORIGIN ?? "";

/** The admin panel, which shares this auth server with the dashboard. */
export const ADMIN_ORIGIN = env.ADMIN_ORIGIN ?? "";

/** This Worker's own public URL (better-auth's baseURL). */
export const AUTH_URL = env.BETTER_AUTH_URL ?? "";

/** Origins allowed to call /api/* with credentials. */
export const DASHBOARD_ORIGINS = [DASHBOARD_ORIGIN, ADMIN_ORIGIN].filter(Boolean);

/** Where a customer manages their plan; undefined without a dashboard to send them to. */
export const planSettingsUrl = DASHBOARD_ORIGIN
  ? `${DASHBOARD_ORIGIN}/?settings=plan`
  : undefined;

/**
 * The single account allowed into the admin panel: a Worker secret, because
 * this repo is public and that id is the only thing standing between a
 * signed-in customer and the admin surface. Unset refuses everyone.
 */
export const ADMIN_USER_ID = env.ADMIN_USER_ID ?? "";

export function isAdmin(userId: string | undefined): boolean {
  return ADMIN_USER_ID !== "" && userId === ADMIN_USER_ID;
}
