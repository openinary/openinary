// Self-contained tests for the setup route handlers. Invokes the handlers
// directly — no Next server, no fetch to localhost. Requires a disposable
// Postgres (TEST_DATABASE_URL); skips cleanly when unset.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const DB_URL = process.env.TEST_DATABASE_URL;

// Route handlers pull in next/server, @/lib/logger (tsconfig path), and
// shared/db — all fine under node with tsx resolving paths.
const { GET } = await import("./check-setup/route.ts");
const { POST } = await import("./auth/setup/route.ts");

// shared/db + shared/auth resolve via the workspace symlink; use dist for
// runtime (the exports map points there) but src types during type-check.
const { initDb, getDb } = await import("shared/db");

if (!DB_URL) {
  test("setup routes smoke (skipped: TEST_DATABASE_URL not set)", { skip: true }, () => {});
} else {
  const saved: Record<string, string | undefined> = {};
  const setEnv = (k: string, v?: string) => {
    saved[k] = process.env[k];
    process.env[k] = v ?? "test-secret-0123456789abcdef0123456789abcdef";
  };

  before(async () => {
    setEnv("DATABASE_URL", DB_URL);
    setEnv("BETTER_AUTH_SECRET");
    await initDb();

    // Empty DB: no admin → setupComplete=false.
    const db = getDb();
    await db.apiKey.deleteMany();
    await db.session.deleteMany();
    await db.account.deleteMany();
    await db.verification.deleteMany();
    await db.user.deleteMany();
  });

  after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  test("GET /api/check-setup: no admin → setupComplete=false", async () => {
    const res = await GET();
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { setupComplete: false });
  });

  test("POST /api/auth/setup: missing fields → 400", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "" }),
      }),
    );
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "Email, password, and name are required");
  });

  test("POST /api/auth/setup: weak password → 400", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "a@b.co", password: "short", name: "A" }),
      }),
    );
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "Password must be at least 8 characters long");
  });

  test("auth.api.signUpEmail: creates admin → check-setup flips true", async () => {
    const { auth } = await import("shared/auth");
    await auth.api.signUpEmail({
      body: {
        email: `admin-${Date.now()}@test.local`,
        password: "Sup3rSecure!",
        name: "Admin",
      },
    });

    const res = await GET();
    assert.deepEqual(await res.json(), { setupComplete: true });
  });
}
