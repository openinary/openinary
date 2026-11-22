import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import { handleOAuthUserInfo } from "better-auth/oauth2";

import { createAuth, oauthRedirectURI, oidcConfig, pictureFromIdToken } from "./auth";
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

const verifiedOf = (db: Db, email: string) =>
  (db.prepare("SELECT emailVerified FROM user WHERE email = ?").get(email) as { emailVerified: number })
    .emailVerified === 1;

const errorCode = async (res: Response) => ((await res.json()) as { code?: string }).code;

/**
 * Sign in with Google the way the OAuth callback does once the provider has
 * answered: Better Auth's own `handleOAuthUserInfo`, with the user info the
 * profile mapping produced. Only the provider round trip is skipped.
 */
async function googleSignIn(
  auth: Auth,
  email: string,
  emailVerified: boolean,
  accountId = "google-sub-1",
  picture?: string,
) {
  // The callback stores the provider's (already verified) ID token on the account.
  const idToken = picture === undefined ? undefined : idTokenWith({ sub: accountId, email, picture });
  return handleOAuthUserInfo({ context: await auth.$context } as never, {
    userInfo: { id: accountId, email, name: email.split("@")[0]!, emailVerified, image: picture },
    account: { providerId: "google", accountId, idToken },
    source: { method: "oauth", oauth: { providerId: "google" } },
  });
}

/** An unsigned JWT with these claims: the hooks only decode what Better Auth verified. */
const idTokenWith = (claims: Record<string, unknown>) =>
  ["{\"alg\":\"none\"}", JSON.stringify(claims)].map((p) => Buffer.from(p).toString("base64url")).join(".") +
  ".sig";

const imageOf = (db: Db, email: string) =>
  (db.prepare("SELECT image FROM user WHERE email = ?").get(email) as { image: string | null }).image;

const accountsOf = (db: Db, userId: string) =>
  (db.prepare("SELECT providerId FROM account WHERE userId = ? ORDER BY providerId").all(userId) as {
    providerId: string;
  }[]).map((a) => a.providerId);

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

test("an admin can't change their own role", async () => {
  const { db, auth } = instance();
  const { user } = await createUser(auth, "owner@acme.com");
  const ownerCookie = cookieOf(await signIn(auth, "owner@acme.com"));
  const res = await http(auth, "/admin/set-role", { userId: user.id, role: "viewer" }, ownerCookie);
  assert.equal(res.status, 403);
  assert.equal(await errorCode(res), "CANNOT_CHANGE_OWN_ROLE");
  assert.equal(roleOf(db, "owner@acme.com"), "admin");
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

test("SSO with a verified email links to the existing password account", async () => {
  const { db, auth } = instance({ AUTH_DEFAULT_ROLE: "member" });
  const { user: owner } = await createUser(auth, "owner@acme.com");
  const { user: member } = await createUser(auth, "member@acme.com");
  // The instance vouches for the password accounts it makes.
  assert.equal(owner.emailVerified, true);
  assert.equal(auth.options.account?.accountLinking?.requireLocalEmailVerified, false);
  // The provider's word is still needed: none is trusted outright.
  assert.deepEqual((await auth.$context).trustedProviders, []);

  const signedIn = await googleSignIn(auth, "Owner@acme.com", true);
  assert.equal(signedIn.error, null);
  assert.equal(signedIn.data?.user.id, owner.id);
  assert.equal(signedIn.data?.session.userId, owner.id);
  assert.equal(signedIn.isRegister, false);
  assert.deepEqual(accountsOf(db, owner.id), ["credential", "google"]);
  assert.equal(roleOf(db, "owner@acme.com"), "admin");
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM user").get() as { n: number }).n, 2);

  // A non-admin keeps their role too, and the next sign-in finds the link.
  assert.equal((await googleSignIn(auth, "member@acme.com", true, "google-sub-2")).data?.user.id, member.id);
  assert.equal((await googleSignIn(auth, "member@acme.com", true, "google-sub-2")).data?.user.id, member.id);
  assert.equal(roleOf(db, "member@acme.com"), "member");
  // Password sign-in still works after the link.
  assert.equal((await signIn(auth, "owner@acme.com")).status, 200);
});

test("SSO with an unverified email never links to an existing account", async () => {
  const { db, auth } = instance();
  const { user: owner } = await createUser(auth, "owner@acme.com");
  // Better Auth's "account not linked", which the callback reports as account_not_linked.
  const refused = await googleSignIn(auth, "owner@acme.com", false);
  assert.equal(refused.error, "account not linked");
  assert.equal(refused.data, null);
  assert.deepEqual(accountsOf(db, owner.id), ["credential"]);

  // The same goes for a Google account outside the allowlisted Workspace,
  // which the profile mapping reports as unverified.
  const policy = readAuthPolicy({
    AUTH_PROVIDERS: "google",
    AUTH_GOOGLE_CLIENT_ID: "g",
    AUTH_ALLOWED_EMAIL_DOMAINS: "acme.com",
  });
  const map = oidcConfig(policy, policy.providers[0]!).mapProfileToUser;
  const emailVerified = map({ email_verified: true, hd: "other.com" }).emailVerified;
  assert.equal((await googleSignIn(auth, "owner@acme.com", emailVerified)).error, "account not linked");
  assert.deepEqual(accountsOf(db, owner.id), ["credential"]);
});

test("linking doesn't let an account outside the allowlist in", async () => {
  const open = instance();
  await createUser(open.auth, "owner@acme.com");
  const { user } = await createUser(open.auth, "viewer@other.org");
  const auth = createAuth(open.db, SECRET, readAuthPolicy({ AUTH_ALLOWED_EMAIL_DOMAINS: "acme.com" }));
  const sessions = () =>
    (open.db.prepare("SELECT COUNT(*) AS n FROM session WHERE userId = ?").get(user.id) as { n: number }).n;
  const before = sessions();
  await assert.rejects(googleSignIn(auth, "viewer@other.org", true), /doesn't have access/);
  assert.equal(sessions(), before);
  // Refused before the link is written, so re-allowing them later doesn't
  // bring an unreviewed SSO login with it.
  assert.deepEqual(accountsOf(open.db, user.id), ["credential"]);
});

test("a banned user signing in with a verified SSO email is refused and not linked", async () => {
  const { db, auth } = instance();
  await createUser(auth, "owner@acme.com");
  const { user } = await createUser(auth, "banned@acme.com");
  db.prepare("UPDATE user SET banned = 1 WHERE id = ?").run(user.id);
  const sessions = () =>
    (db.prepare("SELECT COUNT(*) AS n FROM session WHERE userId = ?").get(user.id) as { n: number }).n;
  const before = sessions();
  await assert.rejects(googleSignIn(auth, "banned@acme.com", true), (e: { body?: { code?: string } }) => {
    assert.equal(e.body?.code, "BANNED_USER");
    return true;
  });
  assert.deepEqual(accountsOf(db, user.id), ["credential"]);
  assert.equal(sessions(), before);
});

test("a new SSO sign-up still creates the user and their account", async () => {
  const { db, auth } = instance({ AUTH_ALLOWED_EMAIL_DOMAINS: "acme.com" });
  await createUser(auth, "owner@acme.com");
  const signedUp = await googleSignIn(auth, "new@acme.com", true, "google-sub-new");
  assert.equal(signedUp.error, null);
  assert.equal(signedUp.isRegister, true);
  assert.deepEqual(accountsOf(db, signedUp.data!.user.id), ["google"]);
  assert.equal(signedUp.data?.session.userId, signedUp.data?.user.id);
});

test("accounts the instance makes are verified, SSO ones keep the provider's word", async () => {
  const { db, auth } = instance();
  // The first sign-up over HTTP (the /setup page), then server-side and admin-made ones.
  assert.equal((await signUp(auth, "owner@acme.com")).status, 200);
  await createUser(auth, "server@acme.com");
  const ownerCookie = cookieOf(await signIn(auth, "owner@acme.com"));
  const added = await http(
    auth,
    "/admin/create-user",
    { email: "added@acme.com", password: throwawayLogin, name: "Added" },
    ownerCookie,
  );
  assert.equal(added.status, 200);
  for (const email of ["owner@acme.com", "server@acme.com", "added@acme.com"]) {
    assert.equal(verifiedOf(db, email), true, email);
  }

  // The callback's create, as the provider reported it.
  const before = auth.options.databaseHooks!.user!.create!.before!;
  const sso = async (emailVerified: boolean) =>
    ((await before({ email: "sso@acme.com", name: "S", emailVerified } as never, {
      path: "/callback/:id",
      request: new Request(`${ORIGIN}/api/auth/callback/google`),
    } as never)) as { data: { emailVerified: boolean } }).data.emailVerified;
  assert.equal(await sso(false), false);
  assert.equal(await sso(true), true);
  // Server-side over an SSO path is still SSO.
  assert.equal(
    ((await before({ email: "sso2@acme.com", name: "S", emailVerified: false } as never, {
      path: "/callback/:id",
    } as never)) as { data: { emailVerified: boolean } }).data.emailVerified,
    false,
  );
});

test("linking works without the deprecated requireLocalEmailVerified: false", async () => {
  const { db, auth } = instance();
  const { user: owner } = await createUser(auth, "owner@acme.com");
  await createUser(auth, "legacy@acme.com");
  // Better Auth 1.8's behaviour: the local address has to be verified.
  const context = await auth.$context;
  (context.options.account!.accountLinking as { requireLocalEmailVerified?: boolean }).requireLocalEmailVerified = true;

  const linked = await googleSignIn(auth, "owner@acme.com", true);
  assert.equal(linked.error, null);
  assert.equal(linked.data?.user.id, owner.id);
  assert.deepEqual(accountsOf(db, owner.id), ["credential", "google"]);

  // The gate is real: an unverified local account (one migrate() hasn't
  // backfilled) is refused, which is what the stopgap option covers today.
  db.prepare("UPDATE user SET emailVerified = 0 WHERE email = ?").run("legacy@acme.com");
  assert.equal((await googleSignIn(auth, "legacy@acme.com", true, "google-sub-3")).error, "account not linked");
});

const AVATAR = "https://lh3.googleusercontent.com/a/avatar-1=s96-c";

test("linking SSO gives a password account without an avatar the provider's picture", async () => {
  const { db, auth } = instance();
  const { user } = await createUser(auth, "owner@acme.com");
  const name = (db.prepare("SELECT name FROM user WHERE id = ?").get(user.id) as { name: string }).name;
  assert.equal(imageOf(db, "owner@acme.com"), null);

  const linked = await googleSignIn(auth, "owner@acme.com", true, "google-sub-1", AVATAR);
  assert.equal(linked.error, null);
  assert.equal(imageOf(db, "owner@acme.com"), AVATAR);
  // Only the avatar: the name and verified email stay the instance's.
  assert.equal((db.prepare("SELECT name FROM user WHERE id = ?").get(user.id) as { name: string }).name, name);
  assert.equal(verifiedOf(db, "owner@acme.com"), true);
});

test("a later SSO sign-in fills an empty avatar but never replaces one", async () => {
  const { db, auth } = instance();
  const { user } = await createUser(auth, "owner@acme.com");
  // Linked while the provider had no picture.
  assert.equal((await googleSignIn(auth, "owner@acme.com", true)).error, null);
  assert.equal(imageOf(db, "owner@acme.com"), null);

  // The next sign-in stores a fresh ID token, now with one.
  db.prepare("UPDATE user SET image = '' WHERE id = ?").run(user.id);
  assert.equal((await googleSignIn(auth, "owner@acme.com", true, "google-sub-1", AVATAR)).error, null);
  assert.equal(imageOf(db, "owner@acme.com"), AVATAR);

  // An avatar the user already has is kept.
  const own = "https://example.com/me.png";
  db.prepare("UPDATE user SET image = ? WHERE id = ?").run(own, user.id);
  await googleSignIn(auth, "owner@acme.com", true, "google-sub-1", "https://lh3.googleusercontent.com/a/other");
  assert.equal(imageOf(db, "owner@acme.com"), own);
});

test("only http(s) pictures of sane length are taken, and a bad one doesn't fail sign-in", async () => {
  assert.equal(pictureFromIdToken(idTokenWith({ picture: AVATAR })), AVATAR);
  assert.equal(pictureFromIdToken(idTokenWith({ picture: "javascript:alert(1)" })), undefined);
  assert.equal(pictureFromIdToken(idTokenWith({ picture: "data:image/png;base64,AAAA" })), undefined);
  assert.equal(pictureFromIdToken(idTokenWith({ picture: `https://x.com/${"a".repeat(2048)}` })), undefined);
  assert.equal(pictureFromIdToken(idTokenWith({ picture: 42 })), undefined);
  assert.equal(pictureFromIdToken(idTokenWith({})), undefined);
  assert.equal(pictureFromIdToken(undefined), undefined);

  const { db, auth } = instance();
  await createUser(auth, "owner@acme.com");
  await createUser(auth, "second@acme.com");
  const bad = await googleSignIn(auth, "owner@acme.com", true, "google-sub-1", "javascript:alert(1)");
  assert.equal(bad.error, null);
  assert.equal(imageOf(db, "owner@acme.com"), null);

  // A malformed ID token is logged and skipped, not a failed sign-in.
  const garbled = await handleOAuthUserInfo({ context: await auth.$context } as never, {
    userInfo: { id: "google-sub-2", email: "second@acme.com", name: "second", emailVerified: true },
    account: { providerId: "google", accountId: "google-sub-2", idToken: "not.@@@.jwt" },
    source: { method: "oauth", oauth: { providerId: "google" } },
  });
  assert.equal(garbled.error, null);
  assert.equal(imageOf(db, "second@acme.com"), null);
});

test("a new SSO user still gets the provider's picture", async () => {
  const { db, auth } = instance();
  await createUser(auth, "owner@acme.com");
  const signedUp = await googleSignIn(auth, "new@acme.com", true, "google-sub-new", AVATAR);
  assert.equal(signedUp.isRegister, true);
  assert.equal(imageOf(db, "new@acme.com"), AVATAR);
});
