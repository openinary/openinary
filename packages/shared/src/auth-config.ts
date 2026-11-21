import { isRole, type Role } from "./permissions";

/**
 * Sign-in policy for a self-hosted instance, read from the environment.
 * Pure (takes `env`), so every rule here is unit tested without a server.
 *
 * Providers are listed by id, then configured under AUTH_<ID>_*:
 *
 *   AUTH_PROVIDERS=google,corp
 *   AUTH_GOOGLE_CLIENT_ID=...          # "google" is a preset: nothing else needed
 *   AUTH_GOOGLE_CLIENT_SECRET=...
 *   AUTH_CORP_TYPE=keycloak            # any preset, or "oidc" for anything else
 *   AUTH_CORP_ISSUER=https://sso.acme.com/realms/acme
 *   AUTH_CORP_NAME=Acme SSO
 *   AUTH_CORP_CLIENT_ID=...
 *   AUTH_CORP_CLIENT_SECRET=...
 *
 * An id that matches a preset uses that preset unless AUTH_<ID>_TYPE says
 * otherwise; any other id defaults to plain "oidc".
 */

export type ProviderType =
  | "google"
  | "microsoft"
  | "okta"
  | "keycloak"
  | "auth0"
  | "authentik"
  | "gitlab"
  | "oidc";

export interface ProviderConfig {
  /** Used in the callback URL: /api/auth/callback/<id> (Better Auth 1.7 serves generic OAuth providers there). */
  id: string;
  type: ProviderType;
  /** The sign-in button's label: "Continue with <name>". */
  name: string;
  discoveryUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  /** False: only people who already have an account may sign in with it. */
  allowSignUp: boolean;
  pkce: boolean;
  /**
   * Treat the provider's email as verified even without an email_verified
   * claim. For IdPs that own every address they issue (a single Entra tenant)
   * and never send the claim.
   */
  trustEmail: boolean;
  /**
   * A claim that names the user's verified organisation domain (Google
   * Workspace's `hd`). When domains are allowlisted, the claim must match one,
   * so a personal account registered with a work address is refused.
   */
  domainClaim?: string;
  authorizationUrlParams?: Record<string, string>;
}

export interface AuthPolicy {
  providers: ProviderConfig[];
  /** Lowercase, no "@". Empty: any domain. */
  allowedDomains: string[];
  /** Role a new account gets, unless it is the first one or an admin email. */
  defaultRole: Role;
  /** Lowercase emails that are made admin when their account is created. */
  adminEmails: string[];
  /** Email and password sign-in. False: SSO only. */
  passwordLogin: boolean;
}

/** What the sign-in page needs to draw itself. Nothing secret. */
export interface PublicAuthOptions {
  providers: { id: string; name: string; type: ProviderType }[];
  passwordLogin: boolean;
}

export class AuthConfigError extends Error {
  constructor(message: string) {
    super(`Invalid sign-in configuration: ${message}`);
    this.name = "AuthConfigError";
  }
}

type Env = Record<string, string | undefined>;

interface Preset {
  name: string;
  /** Discovery URL from the provider's env, or an error message. */
  discovery: (get: (key: string) => string | undefined) => string | { missing: string };
  trustEmail?: boolean;
  domainClaim?: string;
  authorizationUrlParams?: Record<string, string>;
}

const wellKnown = (issuer: string) =>
  `${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`;

const fromIssuer =
  (what: string) =>
  (get: (key: string) => string | undefined): string | { missing: string } => {
    const issuer = get("ISSUER");
    return issuer ? wellKnown(issuer) : { missing: `ISSUER (${what})` };
  };

// Tenants that accept accounts from outside one organisation: their email
// claim is whatever the user typed, so it is never trusted.
const OPEN_ENTRA_TENANTS = new Set(["common", "organizations", "consumers"]);

const PRESETS: Record<Exclude<ProviderType, "oidc">, Preset> = {
  google: {
    name: "Google",
    discovery: () => "https://accounts.google.com/.well-known/openid-configuration",
    domainClaim: "hd",
    authorizationUrlParams: { prompt: "select_account" },
  },
  microsoft: {
    name: "Microsoft",
    discovery: (get) => {
      const tenant = get("TENANT_ID");
      return tenant
        ? `https://login.microsoftonline.com/${tenant}/v2.0/.well-known/openid-configuration`
        : { missing: "TENANT_ID (your Entra directory id)" };
    },
  },
  okta: { name: "Okta", discovery: fromIssuer("e.g. https://acme.okta.com") },
  keycloak: {
    name: "Keycloak",
    discovery: fromIssuer("the realm URL, e.g. https://sso.acme.com/realms/acme"),
  },
  auth0: {
    name: "Auth0",
    discovery: (get) => {
      const issuer = get("ISSUER") ?? (get("DOMAIN") && `https://${get("DOMAIN")}`);
      return issuer ? wellKnown(issuer) : { missing: "ISSUER or DOMAIN (e.g. acme.eu.auth0.com)" };
    },
  },
  authentik: {
    name: "authentik",
    discovery: fromIssuer("e.g. https://auth.acme.com/application/o/openinary/"),
  },
  gitlab: {
    name: "GitLab",
    discovery: (get) => wellKnown(get("ISSUER") ?? "https://gitlab.com"),
  },
};

const PROVIDER_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

const list = (value: string | undefined, separator = /[\s,]+/) =>
  (value ?? "")
    .split(separator)
    .map((v) => v.trim())
    .filter(Boolean);

function bool(value: string | undefined, fallback: boolean, key: string): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  const v = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(v)) return true;
  if (["false", "0", "no", "off"].includes(v)) return false;
  throw new AuthConfigError(`${key} must be true or false, got "${value}".`);
}

export const envPrefix = (id: string) => `AUTH_${id.toUpperCase().replace(/-/g, "_")}_`;

function readProvider(id: string, env: Env, allowedDomains: string[]): ProviderConfig {
  const prefix = envPrefix(id);
  const get = (key: string) => env[prefix + key]?.trim() || undefined;

  const type = (get("TYPE")?.toLowerCase() ?? (id in PRESETS ? id : "oidc")) as ProviderType;
  if (type !== "oidc" && !(type in PRESETS)) {
    throw new AuthConfigError(
      `${prefix}TYPE "${type}" is not one of ${[...Object.keys(PRESETS), "oidc"].join(", ")}.`,
    );
  }
  const preset = type === "oidc" ? undefined : PRESETS[type];

  const clientId = get("CLIENT_ID");
  if (!clientId) throw new AuthConfigError(`${prefix}CLIENT_ID is required for provider "${id}".`);

  // An explicit discovery URL always wins; otherwise the preset builds it.
  let discoveryUrl = get("DISCOVERY_URL");
  if (!discoveryUrl) {
    const built = preset
      ? preset.discovery(get)
      : get("ISSUER")
        ? wellKnown(get("ISSUER")!)
        : { missing: "DISCOVERY_URL or ISSUER" };
    if (typeof built !== "string") {
      throw new AuthConfigError(`${prefix}${built.missing} is required for provider "${id}".`);
    }
    discoveryUrl = built;
  }
  if (!/^https?:\/\//.test(discoveryUrl)) {
    throw new AuthConfigError(`${prefix}DISCOVERY_URL must be an http(s) URL, got "${discoveryUrl}".`);
  }

  const tenant = get("TENANT_ID")?.toLowerCase();
  const presetTrust =
    preset?.trustEmail ?? (type === "microsoft" && !!tenant && !OPEN_ENTRA_TENANTS.has(tenant));

  const authorizationUrlParams = { ...preset?.authorizationUrlParams };
  // Google shows only accounts of that Workspace in its picker. A hint for
  // the user, not a check: the hd claim is what's enforced.
  if (type === "google" && allowedDomains.length === 1) authorizationUrlParams.hd = allowedDomains[0];

  return {
    id,
    type,
    name: get("NAME") ?? preset?.name ?? id,
    discoveryUrl,
    clientId,
    clientSecret: get("CLIENT_SECRET") ?? "",
    scopes: get("SCOPES") ? list(get("SCOPES")) : ["openid", "profile", "email"],
    allowSignUp: bool(get("ALLOW_SIGNUP"), true, `${prefix}ALLOW_SIGNUP`),
    pkce: bool(get("PKCE"), true, `${prefix}PKCE`),
    trustEmail: bool(get("TRUST_EMAIL"), presetTrust, `${prefix}TRUST_EMAIL`),
    domainClaim: get("DOMAIN_CLAIM") ?? preset?.domainClaim,
    ...(Object.keys(authorizationUrlParams).length && { authorizationUrlParams }),
  };
}

export function readAuthPolicy(env: Env = process.env): AuthPolicy {
  const allowedDomains = list(env.AUTH_ALLOWED_EMAIL_DOMAINS?.toLowerCase()).map((d) =>
    d.replace(/^@/, ""),
  );

  const ids = list(env.AUTH_PROVIDERS?.toLowerCase());
  const seen = new Set<string>();
  const providers = ids.map((id) => {
    if (!PROVIDER_ID.test(id)) {
      throw new AuthConfigError(
        `provider id "${id}" in AUTH_PROVIDERS must be lowercase letters, digits and dashes.`,
      );
    }
    if (seen.has(id)) throw new AuthConfigError(`provider "${id}" is listed twice in AUTH_PROVIDERS.`);
    seen.add(id);
    return readProvider(id, env, allowedDomains);
  });

  const defaultRole = env.AUTH_DEFAULT_ROLE?.trim().toLowerCase() || "viewer";
  if (!isRole(defaultRole)) {
    throw new AuthConfigError(`AUTH_DEFAULT_ROLE must be admin, member or viewer, got "${defaultRole}".`);
  }

  const passwordLogin = bool(env.AUTH_PASSWORD_LOGIN, true, "AUTH_PASSWORD_LOGIN");
  if (!passwordLogin && providers.length === 0) {
    throw new AuthConfigError("AUTH_PASSWORD_LOGIN=false needs at least one provider in AUTH_PROVIDERS.");
  }

  return {
    providers,
    allowedDomains,
    defaultRole,
    adminEmails: list(env.AUTH_ADMIN_EMAILS?.toLowerCase()),
    passwordLogin,
  };
}

export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).trim().toLowerCase();
}

export function isEmailDomainAllowed(policy: AuthPolicy, email: string): boolean {
  return policy.allowedDomains.length === 0 || policy.allowedDomains.includes(emailDomain(email));
}

/** The role a new account starts with. The very first account is promoted by the database. */
export function roleForNewUser(policy: AuthPolicy, email: string): Role {
  return policy.adminEmails.includes(email.trim().toLowerCase()) ? "admin" : policy.defaultRole;
}

/**
 * Whether an existing account may still get in. Admins and AUTH_ADMIN_EMAILS
 * always can (as at account creation), so an allowlist change can't lock the
 * instance's owners out, even one since demoted.
 */
export function mayAccess(
  policy: AuthPolicy,
  user: { email: string; role?: string | null; banned?: boolean | number | null },
): boolean {
  if (user.banned) return false;
  return (
    user.role === "admin" ||
    policy.adminEmails.includes(user.email.trim().toLowerCase()) ||
    isEmailDomainAllowed(policy, user.email)
  );
}

/**
 * For providers that state the user's organisation in a claim (Google's `hd`):
 * false when domains are allowlisted and the claim names none of them.
 */
export function domainClaimMatches(
  policy: AuthPolicy,
  provider: ProviderConfig,
  profile: Record<string, unknown>,
): boolean {
  if (!provider.domainClaim || policy.allowedDomains.length === 0) return true;
  const value = profile[provider.domainClaim];
  return typeof value === "string" && policy.allowedDomains.includes(value.toLowerCase());
}

export function publicAuthOptions(policy: AuthPolicy): PublicAuthOptions {
  return {
    providers: policy.providers.map(({ id, name, type }) => ({ id, name, type })),
    passwordLogin: policy.passwordLogin,
  };
}
