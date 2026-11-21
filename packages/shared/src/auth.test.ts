import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import { createAuth, oauthRedirectURI, oidcConfig } from "./auth";
import { readAuthPolicy } from "./auth-config";
import { type Db, getUserAccess, openDb } from "./db";

const SECRET = "x".repeat(32);
const ORIGIN = "http://localhost:3000";
// Generated per run: throwaway accounts in a temp database, never a real credential.
const throwawayLogin = `T1!${randomUUID()}`;

const dirs: string[] = [];
after(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

/** A fresh instance on a temp file, the way the API opens it. */
function instance(env: Record<string, string> = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openinary-auth-"));
  dirs.push(dir);
  const db = openDb(path.join(dir, "auth.db"));
  const auth = createAuth(db, SECRET, readAuthPolicy(env));
  return { db, auth };
}

type Auth = ReturnType<typeof createAuth>;

/** An HTTP request through Better Auth's handler, as the browser makes it. */
function http(auth: Auth, route: string, body: unknown, cookie?: string) {
  return auth.handler(
    new Request(`${ORIGIN}/api/auth${route}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: ORIGIN,
        ...(cookie && { Cookie: cookie }),
      },
      body: JSON.stringify(body),
    }),
  );
}

const signUp = (auth: Auth, email: string) =>
  http(auth, "/sign-up/email", { email, password: throwawayLogin, name: email.split("@")[0] });

const signIn = (auth: Auth, email: string) =>
  http(auth, "/sign-in/email", { email, password: throwawayLogin });

/** Server-side account creation, as /setup and admins do. */
const createUser = (auth: Auth, email: string) =>
  auth.api.signUpEmail({ body: { email, password: throwawayLogin, name: email.split("@")[0] } });

const roleOf = (db: Db, email: string) =>
  (db.prepare("SELECT role FROM user WHERE email = ?").get(email) as { role: string | null } | undefined)?.role;

const errorCode = async (res: Response) => ((await res.json()) as { code?: string }).code;

const cookieOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

test("the first password sign-up is admin, and sign-up then closes", async () => {
  const { db, auth } = instance();
  const first = await signUp(auth, "owner@acme.com");
  assert.equal(first.status, 200);
  const body = (await first.json()) as { user: { role: string } };
  assert.equal(body.user.role, "admin");
  assert.equal(roleOf(db, "owner@acme.com"), "admin");

  const second = await signUp(auth, "someone@acme.com");
  assert.equal(second.status, 403);
  assert.equal(await errorCode(second), "SIGN_UP_CLOSED");
  assert.equal(roleOf(db, "someone@acme.com"), undefined);
});

test("server-side accounts get the default role, admin emails get admin", async () => {
  const { db, auth } = instance({ AUTH_DEFAULT_ROLE: "member", AUTH_ADMIN_EMAILS: "Boss@acme.com" });
  await createUser(auth, "owner@acme.com");
  await createUser(auth, "member@acme.com");
  await createUser(auth, "boss@acme.com");
  const { user } = await auth.api.createUser({
    body: { email: "added@acme.com", password: throwawayLogin, name: "Added" },
  });
  assert.equal(roleOf(db, "owner@acme.com"), "admin");
  assert.equal(roleOf(db, "member@acme.com"), "member");
  assert.equal(roleOf(db, "boss@acme.com"), "admin");
  assert.equal(user.role, "member");
  assert.equal(roleOf(db, "added@acme.com"), "member");
});

test("the default role defaults to viewer", async () => {
  const { db, auth } = instance();
  await createUser(auth, "owner@acme.com");
  await createUser(auth, "second@acme.com");
  assert.equal(roleOf(db, "second@acme.com"), "viewer");
});

test("the domain allowlist refuses new accounts, except the first and admin emails", async () => {
  const { db, auth } = instance({
    AUTH_ALLOWED_EMAIL_DOMAINS: "acme.com",
    AUTH_ADMIN_EMAILS: "consultant@gmail.com",
  });
  // The very first account can't be locked out by the list.
  await createUser(auth, "owner@elsewhere.org");
  await assert.rejects(createUser(auth, "outsider@gmail.com"), /email domain isn't allowed/);
  await createUser(auth, "consultant@gmail.com");
  await createUser(auth, "staff@acme.com");
  assert.equal(roleOf(db, "outsider@gmail.com"), undefined);
  assert.equal(roleOf(db, "consultant@gmail.com"), "admin");
  assert.equal(roleOf(db, "staff@acme.com"), "viewer");
});

test("a first account made through SSO must still pass the allowlist", async () => {
  const { auth } = instance({ AUTH_ALLOWED_EMAIL_DOMAINS: "acme.com" });
  // The OAuth callback can't run without a real provider, so call the create
  // hook the way the callback does: with the /callback/:id route as the path.
  const before = auth.options.databaseHooks?.user?.create?.before;
  assert.ok(before);
  const sso = { path: "/callback/:id" } as Parameters<typeof before>[1];
  const user = (email: string) =>
    ({ email, name: "x", emailVerified: true, createdAt: new Date(), updatedAt: new Date() }) as Parameters<
      typeof before
    >[0];

  await assert.rejects(before(user("stranger@gmail.com"), sso), /email domain isn't allowed/);
  const allowed = await before(user("owner@acme.com"), sso);
  assert.ok(allowed && typeof allowed === "object");
  assert.equal((allowed.data as { role: string }).role, "admin");
});

test("an account outside a newer allowlist can't sign in, an admin can", async () => {
  const open = instance();
  await createUser(open.auth, "owner@other.org");
  await createUser(open.auth, "viewer@other.org");
  await createUser(open.auth, "viewer@acme.com");

  // Same database, restarted with an allowlist.
  const auth = createAuth(open.db, SECRET, readAuthPolicy({ AUTH_ALLOWED_EMAIL_DOMAINS: "acme.com" }));
  const refused = await signIn(auth, "viewer@other.org");
  assert.equal(refused.status, 403);
  assert.equal(await errorCode(refused), "ACCESS_REVOKED");
  assert.equal((await signIn(auth, "owner@other.org")).status, 200);
  assert.equal((await signIn(auth, "viewer@acme.com")).status, 200);
});

test("a banned user can't sign in", async () => {
  const { db, auth } = instance();
  await createUser(auth, "owner@acme.com");
  const { user } = await createUser(auth, "banned@acme.com");
  db.prepare("UPDATE user SET banned = 1 WHERE id = ?").run(user.id);
  assert.equal(getUserAccess(user.id, db)?.banned, true);
  const res = await signIn(auth, "banned@acme.com");
  assert.equal(res.status, 403);
  assert.equal(cookieOf(res).includes("session_token"), false);
  assert.equal(await errorCode(res), "BANNED_USER");
});

test("a ban set through the admin plugin round-trips and blocks sign-in", async () => {
  const { db, auth } = instance();
  await createUser(auth, "owner@acme.com");
  const { user } = await createUser(auth, "member@acme.com");
  const ownerCookie = cookieOf(await signIn(auth, "owner@acme.com"));
  const banned = await http(auth, "/admin/ban-user", { userId: user.id, banExpiresIn: 3600 }, ownerCookie);
  assert.equal(banned.status, 200);
  assert.equal(getUserAccess(user.id, db)?.banned, true);
  assert.equal((await signIn(auth, "member@acme.com")).status, 403);

  const unbanned = await http(auth, "/admin/unban-user", { userId: user.id }, ownerCookie);
  assert.equal(unbanned.status, 200);
  assert.equal(getUserAccess(user.id, db)?.banned, false);
  assert.equal((await signIn(auth, "member@acme.com")).status, 200);
});

test("only admins may call the admin plugin's endpoints", async () => {
  const { auth } = instance({ AUTH_DEFAULT_ROLE: "member" });
  await createUser(auth, "owner@acme.com");
  const { user } = await createUser(auth, "member@acme.com");
  const memberCookie = cookieOf(await signIn(auth, "member@acme.com"));
  const res = await http(auth, "/admin/set-role", { userId: user.id, role: "admin" }, memberCookie);
  assert.equal(res.status, 403);
});

test("AUTH_PASSWORD_LOGIN=false closes password sign-in over HTTP only", async () => {
  const { auth } = instance({
    AUTH_PASSWORD_LOGIN: "false",
    // Discovery is fetched at startup; an unreachable URL only skips the provider.
    AUTH_PROVIDERS: "corp",
    AUTH_CORP_CLIENT_ID: "c",
    AUTH_CORP_DISCOVERY_URL: "http://127.0.0.1:9/.well-known/openid-configuration",
  });
  // Setup still creates the first account server-side.
  await createUser(auth, "owner@acme.com");
  const res = await signIn(auth, "owner@acme.com");
  assert.equal(res.status, 403);
  assert.equal(await errorCode(res), "PASSWORD_LOGIN_DISABLED");
});

test("a viewer can't create an API key, a member can", async () => {
  const { auth } = instance();
  await createUser(auth, "owner@acme.com");
  await createUser(auth, "viewer@acme.com");
  const { user: member } = await auth.api.createUser({
    body: { email: "member@acme.com", password: throwawayLogin, name: "M", role: "member" },
  });
  // An admin's explicit role wins over the default.
  assert.equal(member.role, "member");

  const viewerCookie = cookieOf(await signIn(auth, "viewer@acme.com"));
  const refused = await http(auth, "/api-key/create", { name: "k" }, viewerCookie);
  assert.equal(refused.status, 403);
  assert.equal(await errorCode(refused), "FORBIDDEN_ROLE");

  const memberCookie = cookieOf(await signIn(auth, "member@acme.com"));
  const created = await http(auth, "/api-key/create", { name: "k" }, memberCookie);
  assert.equal(created.status, 200);
});

test("the OIDC profile mapping only vouches for verified, in-organisation emails", () => {
  const env = {
    AUTH_PROVIDERS: "google,corp,entra",
    AUTH_GOOGLE_CLIENT_ID: "g",
    AUTH_CORP_CLIENT_ID: "c",
    AUTH_CORP_ISSUER: "https://i.test",
    AUTH_ENTRA_TYPE: "microsoft",
    AUTH_ENTRA_CLIENT_ID: "m",
    AUTH_ENTRA_TENANT_ID: "0f1e2d3c-aaaa-bbbb-cccc-111122223333",
  };
  const mapper = (policyEnv: Record<string, string>, id: string) => {
    const policy = readAuthPolicy({ ...env, ...policyEnv });
    const config = oidcConfig(policy, policy.providers.find((p) => p.id === id)!);
    assert.equal(config.requireIdTokenVerification, true);
    return (profile: Record<string, unknown>) => config.mapProfileToUser(profile).emailVerified;
  };

  const corp = mapper({}, "corp");
  assert.equal(corp({ email_verified: true }), true);
  assert.equal(corp({ email_verified: "true" }), true);
  assert.equal(corp({ emailVerified: true }), true);
  assert.equal(corp({ email_verified: false }), false);
  assert.equal(corp({}), false);

  // A single Entra tenant never sends the claim but owns every address.
  assert.equal(mapper({}, "entra")({}), true);

  // Google with an allowlist: the Workspace (hd) has to match too.
  const google = mapper({ AUTH_ALLOWED_EMAIL_DOMAINS: "acme.com" }, "google");
  assert.equal(google({ email_verified: true, hd: "acme.com" }), true);
  assert.equal(google({ email_verified: true }), false);
  assert.equal(google({ email_verified: true, hd: "other.com" }), false);
  assert.equal(google({ email_verified: false, hd: "acme.com" }), false);
  // Without an allowlist hd doesn't matter.
  assert.equal(mapper({}, "google")({ email_verified: true }), true);

  const signUpOff = readAuthPolicy({ ...env, AUTH_CORP_ALLOW_SIGNUP: "false" });
  assert.equal(oidcConfig(signUpOff, signUpOff.providers[1]!).disableSignUp, true);
});

test("an unverified SSO email is refused when domains are allowlisted", async () => {
  const { auth } = instance({ AUTH_ALLOWED_EMAIL_DOMAINS: "acme.com" });
  await createUser(auth, "owner@acme.com");
  // The OAuth callback can't run without a provider, so call the hook it runs
  // with the endpoint context it gets.
  const before = auth.options.databaseHooks!.user!.create!.before!;
  const create = (path: string, emailVerified: boolean) =>
    before({ email: "sso@acme.com", name: "S", emailVerified } as never, { path } as never);

  await assert.rejects(create("/callback/:id", false), /didn't confirm this email/);
  await assert.rejects(create("/sign-in/social", false), /didn't confirm this email/);
  assert.deepEqual(await create("/callback/:id", true), {
    data: { email: "sso@acme.com", name: "S", emailVerified: true, role: "viewer" },
  });
  // Password accounts are never verified by a provider; the domain is enough.
  assert.equal(((await create("/admin/create-user", false)) as { data: { role: string } }).data.role, "viewer");
});

test("over SSO, an admin email only becomes admin once the provider verified it", async () => {
  const { auth } = instance({ AUTH_ADMIN_EMAILS: "boss@acme.com" });
  await createUser(auth, "owner@acme.com");
  const before = auth.options.databaseHooks!.user!.create!.before!;
  const roleFor = async (emailVerified: boolean) =>
    ((await before({ email: "boss@acme.com", name: "B", emailVerified } as never, {
      path: "/callback/:id",
    } as never)) as { data: { role: string } }).data.role;
  assert.equal(await roleFor(false), "viewer");
  assert.equal(await roleFor(true), "admin");
});

test("the OIDC redirect URI is the public URL even behind an internal one", () => {
  const saved = { pub: process.env.BETTER_AUTH_URL, internal: process.env.BETTER_AUTH_INTERNAL_URL };
  process.env.BETTER_AUTH_URL = "https://media.acme.com/";
  process.env.BETTER_AUTH_INTERNAL_URL = "http://127.0.0.1:3001";
  try {
    const { auth } = instance({
      AUTH_PROVIDERS: "corp",
      AUTH_CORP_CLIENT_ID: "c",
      AUTH_CORP_ISSUER: "https://idp.test",
    });
    // Read from the plugin's options: building the providers (discovery) only
    // happens on the first request.
    const plugin = auth.options.plugins.find((p) => p.id === "generic-oauth") as unknown as {
      options: { config: { providerId: string; redirectURI?: string }[] };
    };
    assert.deepEqual(
      plugin.options.config.map((c) => c.redirectURI),
      ["https://media.acme.com/api/auth/callback/corp"],
    );
  } finally {
    for (const [key, value] of [
      ["BETTER_AUTH_URL", saved.pub],
      ["BETTER_AUTH_INTERNAL_URL", saved.internal],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  assert.equal(oauthRedirectURI("x", "https://a.test/api/auth/"), "https://a.test/api/auth/callback/x");
  // Without a public URL, Better Auth's baseURL already is the public one.
  assert.equal(oauthRedirectURI("x", undefined), undefined);
});
