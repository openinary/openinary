import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AuthConfigError,
  domainClaimMatches,
  emailDomain,
  envPrefix,
  isEmailDomainAllowed,
  mayAccess,
  publicAuthOptions,
  readAuthPolicy,
  roleForNewUser,
} from "./auth-config";

type Env = Record<string, string | undefined>;

/** One provider `id` with a client id, plus `extra` env. */
const withProvider = (id: string, extra: Env = {}): Env => ({
  AUTH_PROVIDERS: id,
  [`${envPrefix(id)}CLIENT_ID`]: "client",
  [`${envPrefix(id)}CLIENT_SECRET`]: "s3cret-value",
  ...extra,
});

const only = (env: Env) => {
  const [provider] = readAuthPolicy(env).providers;
  assert.ok(provider);
  return provider;
};

const throwsConfig = (env: Env, match: RegExp) =>
  assert.throws(() => readAuthPolicy(env), (err: unknown) => {
    assert.ok(err instanceof AuthConfigError, String(err));
    assert.match((err as Error).message, match);
    return true;
  });

test("an empty environment is password sign-in for anyone, as viewer", () => {
  assert.deepEqual(readAuthPolicy({}), {
    providers: [],
    allowedDomains: [],
    defaultRole: "viewer",
    adminEmails: [],
    passwordLogin: true,
  });
});

test("every preset builds its discovery URL", () => {
  const cases: [string, Env, string][] = [
    ["google", {}, "https://accounts.google.com/.well-known/openid-configuration"],
    [
      "microsoft",
      { AUTH_MICROSOFT_TENANT_ID: "abc-123" },
      "https://login.microsoftonline.com/abc-123/v2.0/.well-known/openid-configuration",
    ],
    ["okta", { AUTH_OKTA_ISSUER: "https://acme.okta.com/" }, "https://acme.okta.com/.well-known/openid-configuration"],
    [
      "keycloak",
      { AUTH_KEYCLOAK_ISSUER: "https://sso.acme.com/realms/acme" },
      "https://sso.acme.com/realms/acme/.well-known/openid-configuration",
    ],
    ["auth0", { AUTH_AUTH0_DOMAIN: "acme.eu.auth0.com" }, "https://acme.eu.auth0.com/.well-known/openid-configuration"],
    ["auth0", { AUTH_AUTH0_ISSUER: "https://login.acme.com" }, "https://login.acme.com/.well-known/openid-configuration"],
    [
      "authentik",
      { AUTH_AUTHENTIK_ISSUER: "https://auth.acme.com/application/o/openinary/" },
      "https://auth.acme.com/application/o/openinary/.well-known/openid-configuration",
    ],
    ["gitlab", {}, "https://gitlab.com/.well-known/openid-configuration"],
    ["gitlab", { AUTH_GITLAB_ISSUER: "https://git.acme.com" }, "https://git.acme.com/.well-known/openid-configuration"],
    ["corp", { AUTH_CORP_ISSUER: "https://idp.acme.com" }, "https://idp.acme.com/.well-known/openid-configuration"],
  ];
  for (const [id, extra, url] of cases) {
    const p = only(withProvider(id, extra));
    assert.equal(p.discoveryUrl, url, id);
    assert.equal(p.type, id === "corp" ? "oidc" : id);
  }
});

test("an explicit discovery URL wins over the preset", () => {
  const p = only(withProvider("okta", { AUTH_OKTA_DISCOVERY_URL: "https://x.test/.well-known/openid-configuration" }));
  assert.equal(p.discoveryUrl, "https://x.test/.well-known/openid-configuration");
});

test("missing required variables name the variable", () => {
  throwsConfig({ AUTH_PROVIDERS: "google" }, /AUTH_GOOGLE_CLIENT_ID is required/);
  throwsConfig(withProvider("microsoft"), /AUTH_MICROSOFT_TENANT_ID/);
  throwsConfig(withProvider("okta"), /AUTH_OKTA_ISSUER/);
  throwsConfig(withProvider("keycloak"), /AUTH_KEYCLOAK_ISSUER/);
  throwsConfig(withProvider("auth0"), /AUTH_AUTH0_ISSUER or DOMAIN/);
  throwsConfig(withProvider("authentik"), /AUTH_AUTHENTIK_ISSUER/);
  throwsConfig(withProvider("corp"), /AUTH_CORP_DISCOVERY_URL or ISSUER/);
  throwsConfig(withProvider("corp", { AUTH_CORP_DISCOVERY_URL: "ftp://x" }), /must be an http\(s\) URL/);
});

test("TYPE picks a preset for any id, and rejects unknown types", () => {
  const p = only(withProvider("work", { AUTH_WORK_TYPE: "Keycloak", AUTH_WORK_ISSUER: "https://kc.test/realms/r" }));
  assert.equal(p.type, "keycloak");
  assert.equal(p.name, "Keycloak");
  assert.equal(p.id, "work");
  // A preset's id can be turned into plain OIDC.
  assert.equal(only(withProvider("google", { AUTH_GOOGLE_TYPE: "oidc", AUTH_GOOGLE_ISSUER: "https://g.test" })).type, "oidc");
  throwsConfig(withProvider("work", { AUTH_WORK_TYPE: "saml" }), /AUTH_WORK_TYPE "saml" is not one of/);
});

test("ids are validated and may not repeat; dashes map to underscores", () => {
  throwsConfig({ AUTH_PROVIDERS: "my_idp" }, /must be lowercase letters, digits and dashes/);
  throwsConfig({ AUTH_PROVIDERS: "-idp" }, /must be lowercase/);
  throwsConfig({ AUTH_PROVIDERS: "a".repeat(33) }, /must be lowercase/);
  throwsConfig(withProvider("google", { AUTH_PROVIDERS: "google, Google" }), /listed twice/);
  assert.equal(envPrefix("my-idp"), "AUTH_MY_IDP_");
  const p = only({ AUTH_PROVIDERS: "my-idp", AUTH_MY_IDP_CLIENT_ID: "c", AUTH_MY_IDP_ISSUER: "https://i.test" });
  assert.equal(p.name, "my-idp");
});

test("several providers are read in order", () => {
  const policy = readAuthPolicy({
    ...withProvider("google"),
    AUTH_PROVIDERS: "google,corp",
    AUTH_CORP_CLIENT_ID: "c",
    AUTH_CORP_ISSUER: "https://i.test",
    AUTH_CORP_NAME: "Acme SSO",
  });
  assert.deepEqual(policy.providers.map((p) => [p.id, p.name]), [["google", "Google"], ["corp", "Acme SSO"]]);
});

test("booleans accept the usual spellings and reject the rest", () => {
  const p = only(withProvider("google", { AUTH_GOOGLE_ALLOW_SIGNUP: "no", AUTH_GOOGLE_PKCE: "OFF", AUTH_GOOGLE_TRUST_EMAIL: "1" }));
  assert.equal(p.allowSignUp, false);
  assert.equal(p.pkce, false);
  assert.equal(p.trustEmail, true);
  const d = only(withProvider("google"));
  assert.equal(d.allowSignUp, true);
  assert.equal(d.pkce, true);
  assert.equal(d.trustEmail, false);
  assert.equal(only(withProvider("google", { AUTH_GOOGLE_PKCE: " " })).pkce, true);
  throwsConfig(withProvider("google", { AUTH_GOOGLE_PKCE: "maybe" }), /AUTH_GOOGLE_PKCE must be true or false/);
  throwsConfig({ AUTH_PASSWORD_LOGIN: "nope" }, /AUTH_PASSWORD_LOGIN must be true or false/);
});

test("scopes default to OIDC's and split on spaces or commas", () => {
  assert.deepEqual(only(withProvider("google")).scopes, ["openid", "profile", "email"]);
  assert.deepEqual(only(withProvider("google", { AUTH_GOOGLE_SCOPES: "openid email, groups" })).scopes, [
    "openid",
    "email",
    "groups",
  ]);
});

test("the default role is validated", () => {
  assert.equal(readAuthPolicy({ AUTH_DEFAULT_ROLE: " Member " }).defaultRole, "member");
  throwsConfig({ AUTH_DEFAULT_ROLE: "owner" }, /AUTH_DEFAULT_ROLE must be admin, member or viewer/);
});

test("turning passwords off needs a provider", () => {
  throwsConfig({ AUTH_PASSWORD_LOGIN: "false" }, /needs at least one provider/);
  assert.equal(readAuthPolicy(withProvider("google", { AUTH_PASSWORD_LOGIN: "false" })).passwordLogin, false);
});

test("domains and admin emails are normalised", () => {
  const policy = readAuthPolicy({
    AUTH_ALLOWED_EMAIL_DOMAINS: "Acme.com, @acme.io",
    AUTH_ADMIN_EMAILS: "Boss@Acme.com other@x.y",
  });
  assert.deepEqual(policy.allowedDomains, ["acme.com", "acme.io"]);
  assert.deepEqual(policy.adminEmails, ["boss@acme.com", "other@x.y"]);
});

test("Google's hd hint is sent only with exactly one allowed domain", () => {
  const params = (domains?: string) =>
    only(withProvider("google", { AUTH_ALLOWED_EMAIL_DOMAINS: domains })).authorizationUrlParams;
  assert.deepEqual(params(), { prompt: "select_account" });
  assert.deepEqual(params("acme.com"), { prompt: "select_account", hd: "acme.com" });
  assert.deepEqual(params("acme.com,acme.io"), { prompt: "select_account" });
  assert.equal(only(withProvider("google")).domainClaim, "hd");
  // Other providers get no params at all.
  const okta = only(withProvider("okta", { AUTH_OKTA_ISSUER: "https://o.test", AUTH_ALLOWED_EMAIL_DOMAINS: "acme.com" }));
  assert.equal(okta.authorizationUrlParams, undefined);
  assert.equal(okta.domainClaim, undefined);
});

test("Microsoft emails are trusted only for a single tenant", () => {
  const trust = (tenant: string, extra: Env = {}) =>
    only(withProvider("microsoft", { AUTH_MICROSOFT_TENANT_ID: tenant, ...extra })).trustEmail;
  assert.equal(trust("0f1e2d3c-aaaa-bbbb-cccc-111122223333"), true);
  assert.equal(trust("common"), false);
  assert.equal(trust("Organizations"), false);
  assert.equal(trust("consumers"), false);
  assert.equal(trust("common", { AUTH_MICROSOFT_TRUST_EMAIL: "true" }), true);
  assert.equal(trust("my-tenant", { AUTH_MICROSOFT_TRUST_EMAIL: "false" }), false);
});

test("email domain helpers", () => {
  assert.equal(emailDomain("A@B.Example.COM"), "b.example.com");
  assert.equal(emailDomain("weird@name@acme.com"), "acme.com");
  assert.equal(emailDomain("nodomain"), "");
  const open = readAuthPolicy({});
  const closed = readAuthPolicy({ AUTH_ALLOWED_EMAIL_DOMAINS: "acme.com" });
  assert.equal(isEmailDomainAllowed(open, "x@anything.org"), true);
  assert.equal(isEmailDomainAllowed(closed, "x@ACME.com"), true);
  assert.equal(isEmailDomainAllowed(closed, "x@evil-acme.com"), false);
  assert.equal(isEmailDomainAllowed(closed, "x@sub.acme.com"), false);
});

test("roleForNewUser: admin emails are admins, the rest the default role", () => {
  const policy = readAuthPolicy({ AUTH_ADMIN_EMAILS: "boss@acme.com", AUTH_DEFAULT_ROLE: "member" });
  assert.equal(roleForNewUser(policy, " Boss@Acme.com "), "admin");
  assert.equal(roleForNewUser(policy, "someone@acme.com"), "member");
});

test("mayAccess: bans always lock out, admins skip the allowlist", () => {
  const policy = readAuthPolicy({ AUTH_ALLOWED_EMAIL_DOMAINS: "acme.com" });
  assert.equal(mayAccess(policy, { email: "a@acme.com", role: "viewer" }), true);
  assert.equal(mayAccess(policy, { email: "a@other.com", role: "member" }), false);
  assert.equal(mayAccess(policy, { email: "a@other.com", role: "admin" }), true);
  assert.equal(mayAccess(policy, { email: "a@acme.com", role: "admin", banned: true }), false);
  assert.equal(mayAccess(policy, { email: "a@acme.com", role: "viewer", banned: 1 }), false);
  assert.equal(mayAccess(policy, { email: "a@acme.com", role: null, banned: 0 }), true);
  assert.equal(mayAccess(readAuthPolicy({}), { email: "a@anything.org" }), true);
  // A named admin email stays in after being demoted, but not once banned.
  const named = readAuthPolicy({ AUTH_ALLOWED_EMAIL_DOMAINS: "acme.com", AUTH_ADMIN_EMAILS: "boss@gmail.com" });
  assert.equal(mayAccess(named, { email: "Boss@Gmail.com", role: "viewer" }), true);
  assert.equal(mayAccess(named, { email: "boss@gmail.com", role: "viewer", banned: true }), false);
  assert.equal(mayAccess(named, { email: "other@gmail.com", role: "viewer" }), false);
});

test("domainClaimMatches only applies with a claim and an allowlist", () => {
  const google = only(withProvider("google"));
  const corp = only(withProvider("corp", { AUTH_CORP_ISSUER: "https://i.test" }));
  const open = readAuthPolicy({});
  const closed = readAuthPolicy({ AUTH_ALLOWED_EMAIL_DOMAINS: "acme.com" });
  assert.equal(domainClaimMatches(open, google, {}), true);
  assert.equal(domainClaimMatches(closed, corp, {}), true);
  assert.equal(domainClaimMatches(closed, google, {}), false);
  assert.equal(domainClaimMatches(closed, google, { hd: "ACME.com" }), true);
  assert.equal(domainClaimMatches(closed, google, { hd: "other.com" }), false);
  assert.equal(domainClaimMatches(closed, google, { hd: ["acme.com"] }), false);
});

test("publicAuthOptions carries no secrets", () => {
  const policy = readAuthPolicy({
    ...withProvider("google"),
    AUTH_PROVIDERS: "google,corp",
    AUTH_CORP_CLIENT_ID: "corp-client-id",
    AUTH_CORP_CLIENT_SECRET: "corp-secret",
    AUTH_CORP_ISSUER: "https://i.test",
    AUTH_ALLOWED_EMAIL_DOMAINS: "acme.com",
    AUTH_ADMIN_EMAILS: "boss@acme.com",
  });
  const options = publicAuthOptions(policy);
  assert.deepEqual(options, {
    providers: [
      { id: "google", name: "Google", type: "google" },
      { id: "corp", name: "corp", type: "oidc" },
    ],
    passwordLogin: true,
  });
  const json = JSON.stringify(options);
  for (const secret of ["s3cret-value", "corp-secret", "corp-client-id", "boss@acme.com", "https://i.test"]) {
    assert.equal(json.includes(secret), false, secret);
  }
});
