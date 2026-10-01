// Health route tests (plan todo 6). DB-backed cases run only when
// TEST_DATABASE_URL is set (docker pg; initDb itself runs `prisma migrate
// deploy` via shared/db). The liveness, auth-gate, and 503 cases always run.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Hono } from "hono";
import health from "./health";

// The /database route registers [apiKeyAuth middleware, composed handler].
// The composed handler (auth chain + DB probe) is lifted onto a stub app so
// the 503 branch is testable without a valid key when the DB is not
// initialized — no product code changed.
const composedDatabaseHandler = health.routes
  .filter((r) => r.path === "/database")
  .map((r) => r.handler)
  .at(-1)!;

const originalUrl = process.env.DATABASE_URL;
const originalTestUrl = process.env.TEST_DATABASE_URL;
const originalSecret = process.env.BETTER_AUTH_SECRET;

after(() => {
  process.env.DATABASE_URL = originalUrl;
  process.env.TEST_DATABASE_URL = originalTestUrl;
  process.env.BETTER_AUTH_SECRET = originalSecret;
});

describe("GET / — public liveness", () => {
  it("returns 200 ok with service name, no auth required", async () => {
    const res = await health.request("/");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, "ok");
    assert.equal(body.service, "openinary-api");
    assert.ok(typeof body.timestamp === "string");
  });
});

describe("GET /database — unauthenticated", () => {
  it("returns 401 Authentication required without Bearer key", async () => {
    const res = await health.request("/database");
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, "Authentication required");
  });

  it("returns 401 for an invalid Bearer key", async () => {
    const res = await health.request("/database", {
      headers: { Authorization: "Bearer not-a-real-key" },
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, "Authentication required");
  });
});

describe("GET /database — DB not initialized (always-run 503 branch)", () => {
  it("returns 503 with database.connected === false", async () => {
    // The shared/db module holds init state per process; this file never
    // called initDb() yet, so the handler's getDb() must throw.
    const stub = new Hono();
    stub.get("/database", composedDatabaseHandler);
    const res = await stub.request("/database");
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.status, "error");
    assert.equal(body.database.connected, false);
    assert.ok(typeof body.database.error === "string" && body.database.error.length > 0);
    assert.match(body.database.error, /not initialized|DATABASE_URL/i);
  });
});

const dbUrl = process.env.TEST_DATABASE_URL;
const describeDb = dbUrl ? describe : describe.skip;

describeDb("GET /database — migrated postgres (TEST_DATABASE_URL)", () => {
  let apiKey = "";

  before(async () => {
    process.env.DATABASE_URL = dbUrl;
    process.env.BETTER_AUTH_SECRET =
      process.env.BETTER_AUTH_SECRET || "test-secret-0123456789abcdef0123456789abcdef";
    delete process.env.NODE_ENV;

    const { initDb } = await import("shared/db");
    await initDb();

    // Create a user + API key via the real auth layer so the REAL
    // apiKeyAuth middleware is exercised end-to-end.
    const { auth } = await import("shared/auth");
    const { getDb } = await import("shared/db");
    const db = getDb();
    let user = await db.user.findFirst();
    if (!user) {
      const signUp = await auth.api.signUpEmail({
        body: {
          email: "admin@test.local",
          password: "super-secret-password-123",
          name: "Admin",
        },
      });
      user = await db.user.findUniqueOrThrow({ where: { id: signUp.user.id } });
    }
    const created = await auth.api.createApiKey({
      body: { name: "health test key", userId: user.id, expiresIn: 24 * 60 * 60 },
    });
    assert.ok(created.key);
    apiKey = created.key;
  });

  it("returns 200 with connected:true, latency, and table counts", async () => {
    const res = await health.request("/database", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, "ok");
    assert.equal(body.database.connected, true);
    assert.equal(typeof body.database.latencyMs, "number");
    assert.ok(body.database.latencyMs >= 0);
    assert.equal(typeof body.database.tables.user, "number");
    assert.equal(typeof body.database.tables.session, "number");
    assert.equal(typeof body.database.tables.account, "number");
    assert.equal(typeof body.database.tables.verification, "number");
    // Our own key lives in the table — count must reflect it.
    assert.ok(body.database.tables.apiKey >= 1);
  });

  it("still 401s a garbage key even with a healthy DB", async () => {
    const res = await health.request("/database", {
      headers: { Authorization: "Bearer garbage-key-123" },
    });
    assert.equal(res.status, 401);
  });
});
