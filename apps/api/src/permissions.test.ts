import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

// Generated per run: throwaway accounts in a temp database, never a real credential.
const throwawayLogin = `T1!${randomUUID()}`;

// The real app, wired as in production, on a throwaway instance.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openinary-permissions-"));
process.env.DB_PATH = path.join(dir, "auth.db");
process.env.BETTER_AUTH_SECRET = "x".repeat(32);
process.env.API_SECRET = "y".repeat(32);
process.env.OPENINARY_TELEMETRY = "false";
process.env.AUTH_ALLOWED_EMAIL_DOMAINS = "acme.com";

type App = (typeof import("./index"))["default"];
let app: App;
let db: import("shared").Db;
const keys: Record<string, string> = {};
const ids: Record<string, string> = {};

before(async () => {
  const { getAuth } = await import("shared/auth");
  const shared = await import("shared");
  app = (await import("./index")).default;
  db = shared.getDb();
  const auth = getAuth();

  // The first account is admin whatever its domain.
  for (const [name, email] of [
    ["admin", "owner@elsewhere.org"],
    ["member", "member@acme.com"],
    ["viewer", "viewer@acme.com"],
    ["banned", "banned@acme.com"],
  ] as const) {
    const { user } = await auth.api.signUpEmail({ body: { email, password: throwawayLogin, name } });
    ids[name] = user.id;
  }
  db.prepare("UPDATE user SET role = 'member' WHERE id = ?").run(ids.member);
  db.prepare("UPDATE user SET banned = 1 WHERE id = ?").run(ids.banned);
  // Added before the allowlist existed: no longer allowed in.
  db.prepare(
    "INSERT INTO user (id, email, name, createdAt, updatedAt, role) VALUES ('outsider', 'x@other.org', 'X', 1, 1, 'member')",
  ).run();
  ids.outsider = "outsider";

  for (const [name, id] of Object.entries(ids)) {
    keys[name] = (await auth.api.createApiKey({ body: { userId: id } })).key;
  }
});

after(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const call = (who: string | null, method: string, url: string, body?: BodyInit, json = false) =>
  app.request(url, {
    method,
    headers: {
      ...(who && { Authorization: `Bearer ${keys[who]}` }),
      ...(json && { "Content-Type": "application/json" }),
    },
    body,
  });

/** Passed authentication and the role check (whatever the route then answers). */
const allowed = async (res: Response) => {
  assert.ok(![401, 403].includes(res.status), `expected allowed, got ${res.status}: ${await res.text()}`);
};

const forbidden = async (res: Response, code = "FORBIDDEN_ROLE") => {
  assert.equal(res.status, 403);
  const body = (await res.json()) as { error: string; code: string };
  assert.equal(body.error, "Forbidden");
  assert.equal(body.code, code);
};

test("viewers read but can't write", async () => {
  await allowed(await call("viewer", "GET", "/storage/folders"));
  await allowed(await call("viewer", "GET", "/queue/stats"));
  await allowed(await call("viewer", "GET", "/activity"));
  await allowed(await call("viewer", "GET", "/onboarding"));
  await allowed(await call("viewer", "POST", "/download-zip", JSON.stringify({ paths: [] }), true));

  await forbidden(await call("viewer", "DELETE", "/storage/a.jpg"));
  await forbidden(await call("viewer", "PATCH", "/storage/a.jpg", "{}", true));
  await forbidden(await call("viewer", "POST", "/storage/cache/clear"));
  await forbidden(await call("viewer", "POST", "/queue/jobs/j1/retry"));
  await forbidden(await call("viewer", "DELETE", "/queue/jobs/j1"));
  await forbidden(await call("viewer", "DELETE", "/invalidate/a.jpg"));
  await forbidden(await call("viewer", "POST", "/upload/sign", "{}", true));
  await forbidden(await call("viewer", "POST", "/upload/createfolder", "{}", true));
  await forbidden(await call("viewer", "POST", "/upload", new FormData()));
  await forbidden(await call("viewer", "GET", "/api-keys/list"));
  await forbidden(await call("viewer", "POST", "/api-keys/create", "{}", true));
});

test("members and admins write", async () => {
  for (const who of ["member", "admin"]) {
    await allowed(await call(who, "DELETE", "/storage/missing.jpg"));
    await allowed(await call(who, "POST", "/queue/jobs/missing/retry"));
    await allowed(await call(who, "DELETE", "/invalidate/missing.jpg"));
    await allowed(await call(who, "POST", "/upload/createfolder", JSON.stringify({}), true));
    await allowed(await call(who, "POST", "/upload", new FormData()));
    const list = await call(who, "GET", "/api-keys/list");
    assert.equal(list.status, 200);
  }
});

test("a presigned upload needs no user and no role", async () => {
  const signed = await call("member", "POST", "/upload/sign", JSON.stringify({ folder: "" }), true);
  assert.equal(signed.status, 200);
  const { signature, expires } = (await signed.json()) as { signature: string; expires: number };
  const form = new FormData();
  form.set("signature", signature);
  form.set("expires", String(expires));
  form.set("folder", "");
  await allowed(await call(null, "POST", "/upload", form));
});

test("banned and locked-out accounts are refused, deleted ones unauthenticated", async () => {
  await forbidden(await call("banned", "GET", "/activity"), "BANNED_USER");
  await forbidden(await call("outsider", "GET", "/activity"), "ACCESS_REVOKED");
  // Nor can a banned account's key fall back to a presigned signature.
  await forbidden(await call("banned", "POST", "/upload", new FormData()), "BANNED_USER");
  assert.equal((await call(null, "GET", "/activity")).status, 401);
});

test("an API key acts with its owner's current role", async () => {
  await forbidden(await call("viewer", "POST", "/queue/jobs/missing/retry"));
  db.prepare("UPDATE user SET role = 'member' WHERE id = ?").run(ids.viewer);
  try {
    await allowed(await call("viewer", "POST", "/queue/jobs/missing/retry"));
  } finally {
    db.prepare("UPDATE user SET role = 'viewer' WHERE id = ?").run(ids.viewer);
  }
  // An unknown role (say, from a newer release) can do nothing.
  db.prepare("UPDATE user SET role = 'owner' WHERE id = ?").run(ids.member);
  try {
    await forbidden(await call("member", "GET", "/activity"));
  } finally {
    db.prepare("UPDATE user SET role = 'member' WHERE id = ?").run(ids.member);
  }
});

test("everyone saves their onboarding, only admins set the workspace", async () => {
  const answers = (workspace?: { name: string; logo?: string | null }) =>
    JSON.stringify({ role: "developer", useCases: ["ecommerce"], ...(workspace && { workspace }) });
  const workspace = async () =>
    ((await (await call("admin", "GET", "/onboarding")).json()) as { workspace: { name: string } | null })
      .workspace?.name;
  const post = async (who: string, body: string) => {
    const res = await call(who, "POST", "/onboarding", body, true);
    assert.equal(res.status, 200, await res.clone().text());
    return ((await res.json()) as { workspaceSaved: boolean }).workspaceSaved;
  };

  // Nobody has named it yet: a viewer's answers save, but name nothing,
  // whether they send a workspace or not.
  assert.equal(await workspace(), undefined);
  assert.equal(await post("viewer", answers()), false);
  assert.equal(await post("viewer", answers({ name: "First" })), false);
  assert.equal(await post("member", answers({ name: "Hijack" })), false);
  assert.equal(await workspace(), undefined);
  const viewerState = (await (await call("viewer", "GET", "/onboarding")).json()) as { completed: boolean };
  assert.equal(viewerState.completed, true);

  // An admin must send a valid one, and it sticks.
  for (const bad of [answers(), answers({ name: "  " }), answers({ name: "Acme", logo: "javascript:x" })]) {
    const res = await call("admin", "POST", "/onboarding", bad, true);
    assert.equal(res.status, 400);
  }
  assert.equal(await post("admin", answers({ name: "  Acme  " })), true);
  assert.equal(await workspace(), "Acme");
  assert.equal(await post("member", answers({ name: "Hijack" })), false);
  assert.equal(await workspace(), "Acme");
});

test("only admins edit the workspace from settings", async () => {
  const put = (who: string | null, body: unknown) =>
    call(who, "PUT", "/onboarding/workspace", JSON.stringify(body), true);
  const logo = "data:image/webp;base64,UklGRg==";

  assert.equal((await put(null, { name: "Nope" })).status, 401);
  await forbidden(await put("viewer", { name: "Nope" }));
  await forbidden(await put("member", { name: "Nope" }));

  for (const bad of [
    {},
    { name: "" },
    { name: "   " },
    { name: 42 },
    { name: "Acme", logo: "https://example.com/logo.png" },
    { name: "Acme", logo: `data:image/png;base64,${"A".repeat(200_001)}` },
    { name: "Acme", logo: 7 },
  ]) {
    const res = await put("admin", bad);
    assert.equal(res.status, 400, JSON.stringify(bad).slice(0, 80));
  }

  const res = await put("admin", { name: `  ${"N".repeat(80)}  `, logo });
  assert.equal(res.status, 200);
  const saved = ((await res.json()) as { workspace: { name: string; logo: string | null } }).workspace;
  assert.deepEqual(saved, { name: "N".repeat(60), logo });

  const state = (await (await call("viewer", "GET", "/onboarding")).json()) as {
    workspace: { name: string; logo: string | null };
  };
  assert.deepEqual(state.workspace, saved);

  assert.equal((await put("admin", { name: "Acme", logo: null })).status, 200);
  const cleared = (await (await call("viewer", "GET", "/onboarding")).json()) as {
    workspace: { name: string; logo: string | null };
  };
  assert.deepEqual(cleared.workspace, { name: "Acme", logo: null });
});
