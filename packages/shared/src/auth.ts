import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { admin } from "better-auth/plugins/admin";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { apiKey } from "@better-auth/api-key";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseEnv } from "util";
import { accessControl, roles } from "./access-control";
import {
  type AuthPolicy,
  domainClaimMatches,
  isEmailDomainAllowed,
  mayAccess,
  type ProviderConfig,
  readAuthPolicy,
  roleForNewUser,
} from "./auth-config";
import { type Db, getDb, getUserAccess, hasAdmin, kvInit, resolveDbPath } from "./db";
import { allowedOrigins, isPlaceholderSecret } from "./env";
import { can } from "./permissions";

const BUILD_TIME_SECRET = "build-time-secret-will-be-replaced";

const rootEnvPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../.env",
);

/** BETTER_AUTH_SECRET from the environment, else from the repo root .env (dev). */
function resolveSecret(): string | undefined {
  if (process.env.BETTER_AUTH_SECRET) return process.env.BETTER_AUTH_SECRET;
  if (!fs.existsSync(rootEnvPath)) return undefined;
  return parseEnv(fs.readFileSync(rootEnvPath, "utf-8")).BETTER_AUTH_SECRET?.trim() || undefined;
}

export function requireSecret(): string {
  const secret = resolveSecret();
  if (!secret) {
    throw new Error(
      "BETTER_AUTH_SECRET is not set.\n" +
        "Set it in the environment or the root .env file. Generate one with: openssl rand -hex 32",
    );
  }
  // Template placeholders only warn: instances already running on one would
  // otherwise stop starting after an upgrade. The build-time value never ran.
  if (secret === BUILD_TIME_SECRET && process.env.NODE_ENV === "production") {
    throw new Error(
      "BETTER_AUTH_SECRET is still the build-time placeholder.\n" +
        "Set a unique one in production: openssl rand -hex 32",
    );
  }
  if (isPlaceholderSecret(secret) || secret.length < 32) {
    console.warn(
      "WARNING: BETTER_AUTH_SECRET is a template placeholder or shorter than 32 characters.\n" +
        "Replace it with: openssl rand -hex 32",
    );
  }
  return secret;
}

/**
 * Refuses a secret that differs from the one the database was first used
 * with: every existing session would silently stop working.
 */
function assertSameSecret(db: Db, secret: string): void {
  const hash = crypto.createHash("sha256").update(secret).digest("hex");
  if (kvInit(db, "secret_hash", hash) !== hash) {
    throw new Error(
      "BETTER_AUTH_SECRET mismatch: the secret has changed since the database was created.\n" +
        "All existing sessions will be invalid. If this is intentional, delete the app_state row with key='secret_hash' and restart.",
    );
  }
}

const forbidden = (message: string, code: string) =>
  APIError.from("FORBIDDEN", { message, code });

// Routes that create accounts with a password. Any other route that creates
// one (/callback/:id, /sign-in/social with an ID token) is single sign-on.
const PASSWORD_CREATE_PATHS = new Set(["/sign-up/email", "/admin/create-user"]);

const truthy = (v: unknown) => v === true || v === "true" || v === 1 || v === "1";

/**
 * The URL the IdP sends people back to: always the public one. Better Auth
 * builds it from `baseURL`, which is BETTER_AUTH_INTERNAL_URL when set (the
 * full image's http://127.0.0.1:3001), and the IdP would refuse that with
 * redirect_uri_mismatch. Undefined without BETTER_AUTH_URL: baseURL is then
 * the public URL anyway.
 */
export function oauthRedirectURI(
  providerId: string,
  publicUrl = process.env.BETTER_AUTH_URL,
): string | undefined {
  if (!publicUrl) return undefined;
  // BETTER_AUTH_URL may be the site or already include the auth base path.
  const base = publicUrl.replace(/\/+$/, "").replace(/\/api\/auth$/, "");
  return `${base}/api/auth/callback/${providerId}`;
}

/** One provider from AUTH_* as Better Auth's generic OIDC config. Exported for tests. */
export function oidcConfig(policy: AuthPolicy, p: ProviderConfig, publicUrl = process.env.BETTER_AUTH_URL) {
  return {
    providerId: p.id,
    name: p.name,
    discoveryUrl: p.discoveryUrl,
    // Both the authorization request and the token exchange prefer this over
    // the baseURL-derived one, so the two always send the same redirect_uri.
    redirectURI: oauthRedirectURI(p.id, publicUrl),
    // Identity comes from ID-token claims, so never fall back to decoding an
    // unverified token if discovery can't give us the issuer's keys.
    requireIdTokenVerification: true,
    clientId: p.clientId,
    clientSecret: p.clientSecret || undefined,
    scopes: p.scopes,
    pkce: p.pkce,
    disableSignUp: !p.allowSignUp,
    authorizationUrlParams: p.authorizationUrlParams,
    // Only `emailVerified` is mapped: Better Auth fills email, name and image
    // from the standard claims. A verified email is what lets the allowlist
    // trust the domain, and what lets Better Auth link the account to an
    // existing one with the same address.
    mapProfileToUser: (profile: Record<string, unknown>) => ({
      emailVerified:
        (p.trustEmail || truthy(profile.email_verified) || truthy(profile.emailVerified)) &&
        domainClaimMatches(policy, p, profile),
    }),
  };
}

export function createAuth(db: Db, secret: string, policy: AuthPolicy = readAuthPolicy()) {
  const publicAuthUrl = process.env.BETTER_AUTH_URL;
  const baseURL =
    process.env.BETTER_AUTH_INTERNAL_URL || publicAuthUrl || "http://localhost:3000";

  return betterAuth({
    database: db,
    // Kept on even when AUTH_PASSWORD_LOGIN=false: /setup and OPENINARY_ADMIN_*
    // create the first account through it server-side. The hook below closes
    // the HTTP routes instead.
    emailAndPassword: { enabled: true },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // Server-side calls (no request) are the instance itself: setup,
        // OPENINARY_ADMIN_* and the API's own key management.
        if (!ctx.request) return;

        if (ctx.path === "/sign-in/email" || ctx.path === "/sign-up/email") {
          if (!policy.passwordLogin) {
            throw forbidden(
              "Password sign-in is turned off on this instance. Use single sign-on.",
              "PASSWORD_LOGIN_DISABLED",
            );
          }
        }

        // Nobody signs up with a password once setup is done: new people come
        // in through SSO, or an admin adds them.
        if (ctx.path === "/sign-up/email" && hasAdmin(db)) {
          throw forbidden(
            "Setup is already completed. Ask an admin to add you, or sign in with single sign-on.",
            "SIGN_UP_CLOSED",
          );
        }

        if (ctx.path === "/api-key/create" || ctx.path === "/api-key/update") {
          const session = await getSessionFromCtx(ctx);
          const role = session && getUserAccess(session.user.id, db)?.role;
          if (session && !can(role, "apiKeys:manage")) {
            throw forbidden("Your role can't manage API keys.", "FORBIDDEN_ROLE");
          }
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user, ctx) => {
            const email = String(user.email ?? "");
            const isFirst = !hasAdmin(db);
            const viaSso = !!ctx?.path && !PASSWORD_CREATE_PATHS.has(ctx.path);

            // A named admin email only counts over SSO once the provider vouches
            // for it: an IdP that lets people type any address would otherwise
            // hand out admin.
            const adminEmail =
              policy.adminEmails.includes(email.trim().toLowerCase()) && (!viaSso || !!user.emailVerified);
            // The named admins, and a first account made through /setup or
            // OPENINARY_ADMIN_*, are let in whatever their domain, so an
            // allowlist can't lock setup out. A first account made through SSO
            // is not: on a fresh instance anyone who can reach the sign-in page
            // could otherwise become admin with an account from any domain.
            const exempt = (isFirst && !viaSso) || adminEmail;
            if (!exempt && !isEmailDomainAllowed(policy, email)) {
              throw forbidden("Your email domain isn't allowed on this instance.", "DOMAIN_NOT_ALLOWED");
            }
            // With an allowlist, an SSO address only counts once the provider
            // vouches for it (or, for Google, names the Workspace in `hd`).
            if (viaSso && policy.allowedDomains.length > 0 && !user.emailVerified) {
              throw forbidden(
                "Your identity provider didn't confirm this email address belongs to an allowed organisation.",
                "EMAIL_NOT_VERIFIED",
              );
            }
            // The first_user_is_admin trigger is what guarantees one admin when
            // two sign-ups race; setting it here too makes the created user
            // Better Auth returns (and the first session) say admin already.
            // An admin who picks a role in /admin/create-user (the plugin has
            // already checked they may set roles) gets that one.
            const body = ctx?.path === "/admin/create-user" ? ctx.body : undefined;
            const chosen = body?.role !== undefined || body?.data?.role !== undefined;
            const role = isFirst
              ? "admin"
              : chosen && typeof user.role === "string"
                ? user.role
                : adminEmail
                  ? roleForNewUser(policy, email)
                  : policy.defaultRole;
            return { data: { ...user, role } };
          },
        },
      },
      session: {
        create: {
          // Every sign-in, every method: an account outside the allowlist
          // (added before it, or the list changed since) no longer gets in.
          before: async (session) => {
            const access = getUserAccess(session.userId, db);
            if (access && !mayAccess(policy, access)) {
              throw forbidden("Your account doesn't have access to this instance.", "ACCESS_REVOKED");
            }
          },
        },
      },
    },
    secret,
    baseURL,
    // Behind Coolify/Docker nginx terminates TLS, so trust forwarded headers.
    trustHost: true,
    trustedOrigins: allowedOrigins(),
    advanced: {
      defaultCookieAttributes: {
        // The internal URL is plain http even when the public one is https.
        secure: (publicAuthUrl || baseURL).startsWith("https://"),
        httpOnly: true,
        sameSite: "lax",
      },
    },
    session: {
      // Validate against the database every time, so a deleted user's cookie
      // stops working at once.
      cookieCache: { enabled: false },
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    plugins: [
      // Roles, bans, and the user management endpoints the Users page calls.
      admin({
        ac: accessControl,
        roles,
        defaultRole: policy.defaultRole,
        adminRoles: ["admin"],
      }),
      ...(policy.providers.length
        ? [genericOAuth({ config: policy.providers.map((p) => oidcConfig(policy, p, publicAuthUrl)) })]
        : []),
      apiKey({
        references: "user",
        // The table predates the plugin's lowercase default. SQLite matched it
        // either way, but Better Auth 1.7's startup schema check is case-sensitive.
        schema: { apikey: { modelName: "apiKey" } },
        permissions: { defaultPermissions: { api: ["read", "write"] } },
        keyExpiration: { maxExpiresIn: 3650 },
        rateLimit: { enabled: true, timeWindow: 60000, maxRequests: 100 },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Auth["$Infer"]["Session"]["session"];
export type AuthUser = Auth["$Infer"]["Session"]["user"];

let sharedPolicy: AuthPolicy | undefined;

/** The instance's sign-in policy from AUTH_*, read once. Throws on a bad config. */
export function getAuthPolicy(): AuthPolicy {
  return (sharedPolicy ??= readAuthPolicy());
}

let shared: Auth | undefined;

/** The process-wide Better Auth instance, built on first use. */
export function getAuth(): Auth {
  if (shared) return shared;
  const secret = requireSecret();
  const db = getDb();
  assertSameSecret(db, secret);
  const policy = getAuthPolicy();
  shared = createAuth(db, secret, policy);

  console.log("Better Auth configuration:");
  console.log(
    `  - Sign-in: ${[
      policy.passwordLogin && "password",
      ...policy.providers.map((p) => `${p.id} (${p.type})`),
    ]
      .filter(Boolean)
      .join(", ")}`,
  );
  console.log(`  - Allowed email domains: ${policy.allowedDomains.join(", ") || "(any)"}`);
  console.log(`  - Default role: ${policy.defaultRole}`);
  console.log(`  - Public URL: ${process.env.BETTER_AUTH_URL || "(not set)"}`);
  console.log(`  - Internal URL: ${process.env.BETTER_AUTH_INTERNAL_URL || "(not set)"}`);
  console.log(`  - Trusted origins: ${allowedOrigins().join(", ")}`);
  console.log(`  - Database: ${resolveDbPath()}`);
  if (process.env.NODE_ENV === "production" && !process.env.BETTER_AUTH_URL) {
    console.warn(
      "WARNING: BETTER_AUTH_URL is not set in production. Set it to your app's URL or sign-in and CORS may fail.",
    );
  }
  return shared;
}
