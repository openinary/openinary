// The better-auth instance. Loaded lazily by auth.ts on the first request
// that needs auth, never at Worker startup: see the note at the top of auth.ts.
import { apiKey } from "@better-auth/api-key";
import { mcp } from "@better-auth/mcp";
import { APIError, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import {
  admin,
  captcha,
  emailOTP,
  jwt,
  lastLoginMethod,
  magicLink,
  organization,
} from "better-auth/plugins";
import { count, eq } from "drizzle-orm";
import { db } from "../../shared/db/index.js";
import * as schema from "../../shared/db/schema/auth.js";
import {
  ADMIN_ORIGIN,
  ADMIN_USER_ID,
  DASHBOARD_ORIGIN,
  DASHBOARD_ORIGINS,
  MCP_RESOURCE,
  MCP_SCOPE,
} from "../config.js";
import { captureEvent, signupAttribution } from "./analytics.js";
import { currentSessionKv, invitationEmail, sendEmail } from "./auth.js";
import { identifyContact } from "./loops.js";
import { notify } from "./push.js";

// The ".openinary.dev" cookie domain is only valid when actually serving on
// that domain (cdn.openinary.dev in prod). Applying it to a local
// http://localhost:3100 origin makes the browser silently reject the
// session cookie - sign-in looks like it succeeds (the API call returns
// 200) but no cookie is ever stored, so every subsequent request is
// unauthenticated. Scope it to the real BETTER_AUTH_URL host instead.
const authHost = new URL(process.env.BETTER_AUTH_URL || "http://localhost")
  .hostname;
const isOpeninaryDomain = authHost.endsWith(".openinary.dev");

/**
 * Public alpha switch. Prod ships closed to unknown emails unless
 * ALLOW_PUBLIC_SIGNUP=true (a var in wrangler.jsonc), so opening or
 * re-closing signups is a deploy, not a code change. Local dev is always
 * open, exactly as before.
 */
const signUpClosed =
  isOpeninaryDomain && process.env.ALLOW_PUBLIC_SIGNUP !== "true";

// Stated in the email, so it lives next to the value it describes.
const OTP_EXPIRY_MINUTES = 10;

/**
 * Deliberately far longer than the sign-in code's ten minutes. This link is in
 * an email nobody asked for - the admin panel sends it when it opens an account
 * off the waitlist (see rpc/admin.ts) - so it is read whenever the person
 * next checks their inbox, not while they wait on a form. Ten minutes would
 * mean the first click almost always lands on an expired token.
 */
const MAGIC_LINK_EXPIRY_HOURS = 24;

// The dashboard root *is* the sign-in page: home.tsx renders SignInForm
// whenever there is no session, so CORS_ORIGIN needs no path appended.
const signInUrl = DASHBOARD_ORIGIN;

const DOCS_OVERVIEW_URL = "https://docs.openinary.dev/cloud/overview";


/** People on a team account right now. */
async function memberCount(organizationId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(schema.member)
    .where(eq(schema.member.organizationId, organizationId));
  return row?.n ?? 0;
}

/** The account id behind a team: its owner's user id. */
async function ownerOf(organizationId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ ownerUserId: schema.organization.ownerUserId })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId));
  return row?.ownerUserId;
}

async function seatLimitOf(organizationId: string): Promise<number> {
  const owner = await ownerOf(organizationId);
  if (!owner) return 0;
  // Imported lazily: billing pulls in the Autumn client, which tests that
  // only exercise sign-in emails never need.
  const { getSeatLimit } = await import("./billing.js");
  return getSeatLimit(owner);
}


export const authInstance = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",

    schema: schema,
  }),
  // Session reads off Postgres. Every dashboard request checks its session,
  // and each check used to be two queries that woke Neon's suspended compute
  // (billed 5 minutes minimum per wake): it was most of the Neon bill.
  //
  // Postgres stays the source of truth (storeSessionInDatabase,
  // verification.storeInDatabase): writes still land there, a KV miss falls
  // back to it, and sessions created before this store existed keep working
  // until they expire. KV only absorbs the reads. The price is KV's
  // eventual consistency: a revoked session (ban, sign-out elsewhere) can
  // stay readable for up to ~60s at other Cloudflare locations.
  secondaryStorage: {
    get: async (key) => (currentSessionKv()?.get(key) ?? null),
    set: async (key, value, ttl) => {
      // KV refuses an expirationTtl under 60s; rounding a near-expired
      // session up to a minute is harmless next to failing the write.
      await currentSessionKv()?.put(
        key,
        value,
        ttl ? { expirationTtl: Math.max(60, Math.ceil(ttl)) } : undefined,
      );
    },
    delete: async (key) => {
      await currentSessionKv()?.delete(key);
    },
    // KV has no atomic read-and-delete or counter. better-auth only calls
    // these for KV-only verifications and KV-backed rate limiting, both ruled
    // out just below; throwing makes a config change that re-enables either
    // fail loudly instead of racing.
    getAndDelete: () => {
      throw new Error("AUTH_SESSIONS: getAndDelete unsupported on KV");
    },
    increment: () => {
      throw new Error("AUTH_SESSIONS: increment unsupported on KV");
    },
  },
  session: { storeSessionInDatabase: true },
  verification: { storeInDatabase: true },
  // Configuring secondaryStorage would otherwise move rate limiting there: a
  // KV write per auth request, on a store that allows one write per key per
  // second. Keep the in-memory default it had before.
  rateLimit: { storage: "memory" },
  // Two dashboards on two subdomains share this auth server: the customer app
  // (CORS_ORIGIN) and the admin panel (ADMIN_ORIGIN).
  trustedOrigins: DASHBOARD_ORIGINS,
  user: {
    additionalFields: {
      // Mirrors the column in shared/db/schema/auth.ts. Declaring it here is what
      // makes it come back from listUsers/getUser instead of being stripped.
      suspended: { type: "boolean", defaultValue: false, input: false },
    },
  },
  hooks: {
    // Funnel step after agent_prompt_copied: someone clicked Allow on
    // /oauth/consent for a coding agent (Claude Code, Cursor...). Denials and
    // agents that already had consent never get here.
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/oauth2/consent" || ctx.body?.accept !== true) return;
      if (ctx.context.returned instanceof APIError) return;
      const userId = ctx.context.session?.user.id;
      const clientId = new URLSearchParams(ctx.body?.oauth_query ?? "").get(
        "client_id",
      );
      if (!userId || !clientId) return;
      const [client] = await db
        .select({ name: schema.oauthClient.name })
        .from(schema.oauthClient)
        .where(eq(schema.oauthClient.clientId, clientId))
        .limit(1);
      await captureEvent("agent_connected", userId, {
        agent: client?.name || "unknown",
        client_id: clientId,
      });
    }),
  },
  // One Telegram ping per new account, self-serve or admin-created, with a
  // link to its admin page. notify() swallows every failure, so a dead bot
  // can never cost a signup.
  databaseHooks: {
    user: {
      create: {
        after: async (created, ctx) => {
          await notify(
            "New Openinary Cloud account",
            `${created.email} (${created.name})`,
            ADMIN_ORIGIN ? `${ADMIN_ORIGIN}/users/${created.id}` : undefined,
          );
          // Funnel step "account created". Same user id the web app passes
          // to posthog.identify(), so the person's anonymous marketing-site
          // events merge into this one.
          //
          // Where they came from rides in on the request's own PostHog
          // cookie (see signupAttribution) - except when the admin panel
          // opens a waitlist account, because rpc/admin.ts hands
          // auth.api.createUser the *admin's* headers and every account
          // opened that way would otherwise be attributed to whatever
          // referred the admin.
          const attribution =
            ADMIN_ORIGIN && ctx?.headers?.get("origin") === ADMIN_ORIGIN
              ? {}
              : signupAttribution(ctx?.headers?.get("cookie"));
          await captureEvent("cloud_account_created", created.id, {
            email: created.email,
            $set: { email: created.email, name: created.name },
            ...attribution,
          });
          // Creating the Loops contact *is* the signup sequence's trigger, so
          // this is the one lifecycle call that can't wait for the daily sync
          // in lib/loops.ts: an introduction email that lands a day late is a
          // different email. Everything it needs is on `created`, so it costs
          // one request and no reads. Swallows its own failures.
          await identifyContact(created, {
            plan: "free",
            bucketCount: 0,
            apiKeyCount: 0,
            storageMb: 0,
            transformCount: 0,
            usagePercent: 0,
            lastActiveAt: created.createdAt.toISOString(),
          });
        },
      },
    },
  },
  // Each social provider only activates when its credentials are set; the
  // web app always shows both buttons, so unset env vars surface as a
  // sign-in error. Same signup rule as the email code for both: when signups
  // are closed, an unknown Google or GitHub account is rejected instead of
  // silently creating one.
  socialProviders: {
    ...(process.env.GOOGLE_CLIENT_ID && {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
        disableSignUp: signUpClosed,
      },
    }),
    ...(process.env.GITHUB_CLIENT_ID && {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
        disableSignUp: signUpClosed,
      },
    }),
  },
  plugins: [
    // Passwords are gone: signing in means receiving a 6-digit code. The same
    // endpoint registers a first-time visitor, so there is no separate
    // sign-up flow - `signUpClosed` (see ALLOW_PUBLIC_SIGNUP above) decides
    // whether prod accepts unknown emails. While closed, the plugin doesn't
    // even send a code to an address it doesn't know, so it can't be used to
    // mail strangers; while open, Turnstile (below) still gates the send.
    emailOTP({
      disableSignUp: signUpClosed,
      expiresIn: OTP_EXPIRY_MINUTES * 60,
      // Default is "plain" - a leaked DB read would hand over live codes.
      storeOTP: "hashed",
      async sendVerificationOTP({ email, otp }) {
        // No sending credentials outside prod: the code goes to the wrangler
        // console instead of an inbox, which is all local dev needs.
        if (!process.env.CLOUDFLARE_EMAIL_TOKEN) {
          console.log(`[auth] sign-in code for ${email}: ${otp}`);
          return;
        }
        await sendEmail({
          to: email,
          // Code in the subject too: it shows up in the notification, so the
          // common case never needs the email opened.
          subject: `${otp} is your Openinary sign-in code`,
          text: `Your Openinary sign-in code is ${otp}\n\nIt expires in ${OTP_EXPIRY_MINUTES} minutes. If you didn't ask to sign in, ignore this email.`,
          html: `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#111">
  <p style="margin:0 0 16px;font-size:15px">Use this code to sign in to Openinary:</p>
  <p style="margin:0 0 16px;font-size:32px;font-weight:700;letter-spacing:8px">${otp}</p>
  <p style="margin:0;font-size:13px;color:#666">It expires in ${OTP_EXPIRY_MINUTES} minutes. If you didn't ask to sign in, ignore this email.</p>
</div>`,
        });
      },
    }),
    // Powers the admin panel (apps/cloud/admin). No `roles`/`ac` matrix and no
    // `role` column in use: there is exactly one administrator, named by id,
    // and adminUserIds grants every admin operation on its own. An unset
    // ADMIN_USER_ID leaves the list holding "", which no row can match, so
    // the endpoints stay closed rather than open.
    //
    // Impersonation (support: see the customer dashboard as they see it) uses
    // the plugin's own endpoints, called straight from the browser. The
    // admin's session waits in a signed `admin_session` cookie, and the
    // borrowed one lasts the plugin's default hour. Admins themselves cannot
    // be impersonated.
    admin({ adminUserIds: [ADMIN_USER_ID] }),
    /**
     * Onboarding only. Nothing in either dashboard calls this - the admin panel
     * does, server-side, when it opens an account for someone on the waitlist:
     * one click on a link beats reading a code out of an email that has been
     * sitting there since yesterday.
     *
     * Normal sign-in stays on emailOTP above. `disableSignUp` matches it too:
     * while signups are closed, a link for an address that no longer has an
     * account fails closed instead of quietly recreating it.
     */
    magicLink({
      disableSignUp: signUpClosed,
      expiresIn: MAGIC_LINK_EXPIRY_HOURS * 60 * 60,
      // Same reasoning as storeOTP above: a leaked DB read would otherwise hand
      // over live sign-in links, and these live for a day.
      storeToken: "hashed",
      async sendMagicLink({ email, url }) {
        if (!process.env.CLOUDFLARE_EMAIL_TOKEN) {
          console.log(`[auth] magic link for ${email}: ${url}`);
          return;
        }
        await sendEmail({
          to: email,
          subject: "Your Openinary account is ready",
          text: `Your Openinary account is ready.\n\nSign in here:\n${url}\n\nThe link works for ${MAGIC_LINK_EXPIRY_HOURS} hours. After that, request a code from the sign-in page:\n${signInUrl}\n\nNew here? Start with the docs:\n${DOCS_OVERVIEW_URL}`,
          html: `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#111">
  <p style="margin:0 0 16px;font-size:15px">Your Openinary account is ready.</p>
  <p style="margin:0 0 16px"><a href="${url}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#111;color:#fff;text-decoration:none;font-size:15px;font-weight:600">Sign in to Openinary</a></p>
  <p style="margin:0 0 16px;font-size:13px;color:#666">The link works for ${MAGIC_LINK_EXPIRY_HOURS} hours. After that, request a code from the <a href="${signInUrl}" style="color:#111">sign-in page</a>.</p>
  <p style="margin:0;font-size:13px;color:#666">New here? Start with the <a href="${DOCS_OVERVIEW_URL}" style="color:#111">documentation</a>.</p>
</div>`,
        });
      },
    }),
    apiKey({
      defaultPrefix: "oik_",
      enableMetadata: true,
      // The plugin defaults to 10 requests/day per key, which is nothing for a
      // media API. Quotas are already enforced per account by Autumn
      // (lib/billing.ts), so leave throttling to that.
      rateLimit: { enabled: false },
    }),
    /**
     * Teams (worker/lib/account.ts, worker/rpc/team.ts). One organization per
     * owner, created only by rpc/team.ts, keyed by `ownerUserId`: the account
     * id storage, billing and the CDN already use. Roles are the plugin's
     * defaults (owner, admin, member), which already stop a member inviting
     * or changing roles; what each role may do with buckets, keys and billing
     * is lib/account.ts's `can()`.
     *
     * Seats (owner included) cap members plus pending invitations: the
     * invitation limit is whatever seats are left, and accepting re-checks
     * the member count in case the plan dropped meanwhile.
     */
    organization({
      allowUserToCreateOrganization: false,
      membershipLimit: (_user, org) => seatLimitOf(org.id),
      invitationLimit: async ({ organization: org }) =>
        Math.max(0, (await seatLimitOf(org.id)) - (await memberCount(org.id))),
      invitationExpiresIn: 48 * 60 * 60,
      // The invite is bound to an address: only a proven owner of it may join.
      requireEmailVerificationOnInvitation: true,
      // Our code tears teams down (admin user deletion); a stray client call
      // must not cut every member off at once.
      disableOrganizationDeletion: true,
      organizationHooks: {
        // ownerUserId is the tenant every request resolves to. Rewriting it
        // would point the team at another customer's storage and billing.
        beforeUpdateOrganization: async ({ organization: data }) => {
          if ("ownerUserId" in data) {
            throw new APIError("FORBIDDEN", {
              message: "The account owner can't be changed.",
            });
          }
        },
      },
      // Inviting the same email again replaces the old link instead of stacking.
      cancelPendingInvitationsOnReInvite: true,
      async sendInvitationEmail({ id, email, role, organization: org, inviter }) {
        const url = `${DASHBOARD_ORIGIN}/invite/${id}`;
        if (!process.env.CLOUDFLARE_EMAIL_TOKEN) {
          console.log(`[auth] team invitation for ${email}: ${url}`);
          return;
        }
        await sendEmail({
          to: email,
          ...invitationEmail({
            inviterName: inviter.user.name || inviter.user.email,
            accountName: org.name,
            role,
            url,
          }),
        });
      },
      schema: {
        organization: {
          additionalFields: {
            ownerUserId: { type: "string", required: true, input: true },
          },
        },
        member: {
          additionalFields: {
            activeBucketId: { type: "string", required: false, input: false },
          },
        },
      },
    }),
    // Signs the OAuth access tokens below. No set-auth-jwt header: a session
    // JWT shares the signing key, so none is handed out to be mistaken for
    // an access token (the plugin's own /token is disabled further down).
    jwt({ disableSettingJwtHeader: true }),
    /**
     * OAuth for the MCP server (worker/mcp/): an agent registers itself, the
     * person signs in on the dashboard and approves it there, and the agent
     * gets a JWT bound to MCP_RESOURCE. No API key ever goes through a chat.
     *
     * Registration is open because that is how MCP clients (Claude Code,
     * Cursor, Codex) connect today; a registered client can do nothing until
     * a signed-in person consents. The consent is tied to the account the
     * dashboard has active, and that id rides in the token as `org` so /mcp
     * acts on the same account (re-checked against membership every call).
     */
    mcp({
      resource: MCP_RESOURCE,
      loginPage: DASHBOARD_ORIGIN,
      consentPage: `${DASHBOARD_ORIGIN}/oauth/consent`,
      scopes: ["openid", "profile", "email", "offline_access", MCP_SCOPE],
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      // CLI agents register without an application_type and redirect to a
      // loopback port: "infer" makes those native clients instead of
      // refusing them as web clients without https.
      clientRegistrationDefaultApplicationType: "infer",
      clientRegistrationDefaultScopes: [
        "openid",
        "profile",
        "email",
        "offline_access",
        MCP_SCOPE,
      ],
      postLogin: {
        page: `${DASHBOARD_ORIGIN}/oauth/consent`,
        shouldRedirect: () => false,
        consentReferenceId: ({ session }) =>
          (session.activeOrganizationId as string | null | undefined) ??
          undefined,
      },
      customAccessTokenClaims: ({ referenceId }) => ({
        org: referenceId ?? null,
      }),
    }),
    // Cookie-only (no storeInDatabase): the sign-in form just needs a hint of
    // which button to highlight, and the cookie is readable client-side.
    lastLoginMethod({
      // The plugin only names the built-in password routes, so the OTP
      // sign-in would otherwise leave no trace and the badge would never
      // appear again. null falls through to its default (Google, etc.).
      customResolveMethod: (ctx) =>
        ctx.path === "/sign-in/email-otp" ? "email" : null,
    }),
    // Turnstile guards the endpoints that actually cost something (an email
    // per call); the code check that follows is already attempt-limited by
    // the OTP plugin, and the widget's token is single-use anyway. Unset
    // secret = plugin off, so local dev works without a Cloudflare key (the
    // web form skips the widget on the same signal, via
    // NEXT_PUBLIC_TURNSTILE_SITE_KEY).
    //
    // /sign-in/magic-link is listed even though no form posts to it: enabling
    // the plugin publishes the route, and without this anyone could POST a
    // known customer's address to it and mail them. This does not affect the
    // admin panel's own use of it - captcha hooks on `onRequest`, which only
    // fires for a real inbound request, never for a server-side auth.api call.
    ...(process.env.TURNSTILE_SECRET_KEY
      ? [
          captcha({
            provider: "cloudflare-turnstile",
            secretKey: process.env.TURNSTILE_SECRET_KEY,
            endpoints: [
              "/email-otp/send-verification-otp",
              "/sign-in/magic-link",
            ],
          }),
        ]
      : []),
  ],
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  // The jwt plugin's session-to-JWT endpoint: nothing here uses it, and its
  // tokens are signed with the access-token key.
  disabledPaths: ["/token"],
  advanced: isOpeninaryDomain
    ? {
        crossSubDomainCookies: {
          enabled: true,
          domain: ".openinary.dev",
        },
        // Preprod (preprod-cdn.openinary.dev) shares the .openinary.dev cookie
        // domain with prod: without its own prefix, signing in there would
        // overwrite the prod session cookie, and the reverse.
        cookiePrefix: process.env.AUTH_COOKIE_PREFIX || undefined,
      }
    : undefined,
});
