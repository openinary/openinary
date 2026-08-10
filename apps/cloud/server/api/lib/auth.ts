import { apiKey } from "@better-auth/api-key";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  admin,
  captcha,
  emailOTP,
  lastLoginMethod,
  magicLink,
} from "better-auth/plugins";
import { db } from "../db/index.js";
import * as schema from "../db/schema/auth.js";
import { captureEvent, signupAttribution } from "./analytics.js";
import { identifyContact } from "./loops.js";
import { notify } from "./push.js";

// The ".openinary.dev" cookie domain is only valid when actually serving on
// that domain (cdn.openinary.dev in prod). Applying it to a local
// http://localhost:3000 origin makes the browser silently reject the
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
 * off the waitlist (see routers/admin.ts) - so it is read whenever the person
 * next checks their inbox, not while they wait on a form. Ten minutes would
 * mean the first click almost always lands on an expired token.
 */
const MAGIC_LINK_EXPIRY_HOURS = 24;

// The dashboard root *is* the sign-in page: home.tsx renders SignInForm
// whenever there is no session, so CORS_ORIGIN needs no path appended.
const signInUrl = process.env.CORS_ORIGIN;

const DOCS_OVERVIEW_URL = "https://docs.openinary.dev/cloud/overview";

/**
 * Cloudflare Email Sending, over its REST API rather than the Worker's
 * `send_email` binding: the binding needs `import { env } from
 * "cloudflare:workers"`, a specifier Node can't resolve, and this module is
 * pulled into worker/*.check.ts, which run under plain tsx. One fetch keeps
 * the file runnable in both places.
 *
 * The sending domain is onboarded once, out of band:
 *   wrangler email sending enable openinary.dev
 */
export async function sendEmail(message: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/email/sending/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_EMAIL_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...message,
        from: { address: "login@openinary.dev", name: "Openinary" },
      }),
    },
  );
  // Better Auth swallows nothing: a throw here surfaces as a failed
  // send-code call, which is what the sign-in form needs to report.
  if (!res.ok) {
    throw new Error(`Email send failed (${res.status}): ${await res.text()}`);
  }
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",

    schema: schema,
  }),
  // Two dashboards on two subdomains share this auth server: the customer app
  // (CORS_ORIGIN) and the admin panel (ADMIN_ORIGIN). Empty strings are
  // filtered out so an unset ADMIN_ORIGIN doesn't trust "".
  trustedOrigins: [process.env.CORS_ORIGIN, process.env.ADMIN_ORIGIN].filter(
    (origin): origin is string => Boolean(origin),
  ),
  user: {
    additionalFields: {
      // Mirrors the column in db/schema/auth.ts. Declaring it here is what
      // makes it come back from listUsers/getUser instead of being stripped.
      suspended: { type: "boolean", defaultValue: false, input: false },
    },
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
            process.env.ADMIN_ORIGIN
              ? `${process.env.ADMIN_ORIGIN}/users/${created.id}`
              : undefined,
          );
          // Funnel step "account created". Same user id the web app passes
          // to posthog.identify(), so the person's anonymous marketing-site
          // events merge into this one.
          //
          // Where they came from rides in on the request's own PostHog
          // cookie (see signupAttribution) - except when the admin panel
          // opens a waitlist account, because routers/admin.ts hands
          // auth.api.createUser the *admin's* headers and every account
          // opened that way would otherwise be attributed to whatever
          // referred the admin.
          const attribution =
            ctx?.headers?.get("origin") === process.env.ADMIN_ORIGIN
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
  // Google OAuth only activates when credentials are provided; the web app
  // always shows the button, so unset env vars surface as a sign-in error.
  socialProviders: process.env.GOOGLE_CLIENT_ID
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
          // Same signup rule as the email code: when signups are closed,
          // Google sign-in only logs in existing users; an unknown Google
          // account is rejected instead of silently creating one.
          disableSignUp: signUpClosed,
        },
      }
    : undefined,
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
    // Powers the admin panel (apps/admin). No `roles`/`ac` matrix and no
    // `role` column in use: there is exactly one administrator, named by id,
    // and adminUserIds grants every admin operation on its own. An unset
    // ADMIN_USER_ID leaves the list holding "", which no row can match, so
    // the endpoints stay closed rather than open.
    admin({ adminUserIds: [process.env.ADMIN_USER_ID ?? ""] }),
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
      // (lib/autumn.ts), so leave throttling to that.
      rateLimit: { enabled: false },
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
  advanced: isOpeninaryDomain
    ? {
        crossSubDomainCookies: {
          enabled: true,
          domain: ".openinary.dev",
        },
      }
    : undefined,
});
