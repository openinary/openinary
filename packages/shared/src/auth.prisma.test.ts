// Auth-on-Prisma tests (todo 4). DB-backed cases run only when
// TEST_DATABASE_URL is set (docker pg; initDb itself runs `prisma migrate
// deploy`). The missing-DATABASE_URL case always runs.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

const dbUrl = process.env.TEST_DATABASE_URL;
const describeDb = dbUrl ? describe : describe.skip;

const originalUrl = process.env.DATABASE_URL;
const originalSecret = process.env.BETTER_AUTH_SECRET;

after(() => {
  process.env.DATABASE_URL = originalUrl;
  process.env.BETTER_AUTH_SECRET = originalSecret;
});

describe("initDb — missing DATABASE_URL (auth path)", () => {
  it("rejects with an error mentioning DATABASE_URL", async () => {
    delete process.env.DATABASE_URL;
    const { initDb } = await import("./db/index.js");
    await assert.rejects(
      () => initDb(),
      (err: Error) => err.message.includes("DATABASE_URL"),
    );
  });

  it("auth accessor throws a clear pre-init error", async () => {
    delete process.env.DATABASE_URL;
    const { auth } = await import("./auth.js");
    assert.throws(() => (auth as { api?: unknown }).api, /not initialized/i);
  });
});

describeDb("auth on Prisma (TEST_DATABASE_URL)", () => {
  before(() => {
    process.env.DATABASE_URL = dbUrl;
    process.env.BETTER_AUTH_SECRET =
      process.env.BETTER_AUTH_SECRET || "test-secret-0123456789abcdef0123456789abcdef";
    delete process.env.NODE_ENV;
  });

  it("initDb → initAuth: signup/login round-trip via auth.api", async () => {
    const { initDb } = await import("./db/index.js");
    const { auth, hasAdminAccount } = await import("./auth.js");

    await initDb();
    // Idempotent second call (migrate deploy + auth init no-op).
    await initDb();

    // Reset app tables so reruns against a persistent test container pass
    // (authConfig keeps its row — the secret-hash test asserts it).
    const { getDb } = await import("./db/index.js");
    const db = getDb();
    await db.apiKey.deleteMany();
    await db.session.deleteMany();
    await db.account.deleteMany();
    await db.verification.deleteMany();
    await db.user.deleteMany();
    await db.videoJob.deleteMany();

    assert.equal(await hasAdminAccount(), false);

    const signUp = await auth.api.signUpEmail({
      body: {
        email: "admin@test.local",
        password: "super-secret-password-123",
        name: "Admin",
      },
    });
    assert.ok(signUp.user.id);

    const signIn = await auth.api.signInEmail({
      body: {
        email: "admin@test.local",
        password: "super-secret-password-123",
      },
    });
    assert.equal(signIn.user.id, signUp.user.id);
  });

  it("apiKey create + verify round-trip (plugin referenceId → userId mapping)", async () => {
    const { auth } = await import("./auth.js");
    const { getDb } = await import("./db/index.js");

    const user = await getDb().user.findFirstOrThrow();
    const created = await auth.api.createApiKey({
      body: {
        name: "test key",
        userId: user.id,
        expiresIn: 24 * 60 * 60, // 1 day — plugin converts to days, min 1
      },
    });
    assert.ok("key" in created && created.key);

    const verified = await auth.api.verifyApiKey({
      body: { key: created.key },
    });
    assert.equal(verified.valid, true);
    // verifyApiKey returns the plugin's field name for the owner column.
    assert.equal(verified.key?.referenceId, user.id);

    // The DB column (and app queries) see `userId`.
    const row = await getDb().apiKey.findFirstOrThrow({
      where: { id: created.id },
    });
    assert.equal(row.userId, user.id);
    assert.ok(row.createdAt instanceof Date);
    assert.ok(row.expiresAt instanceof Date);
  });

  it("2nd admin signup rejected by the single_admin_guard constraint trigger", async () => {
    const { auth } = await import("./auth.js");
    await assert.rejects(
      () =>
        auth.api.signUpEmail({
          body: {
            email: "second@test.local",
            password: "another-password-456",
            name: "Second",
          },
        }),
      // better-auth wraps the pg trigger error as a generic "Failed to
      // create user"; the cause chain carries the trigger message. Assert on
      // whichever layer surfaces it.
      (err: unknown) => {
        const seen = [
          String(err instanceof Error ? err.message : err),
          String((err as { cause?: unknown })?.cause ?? ""),
        ].join(" ");
        return (
          seen.includes("Only one user account is allowed") ||
          seen.includes("Failed to create user")
        );
      },
    );
    const { getDb } = await import("./db/index.js");
    assert.equal(await getDb().user.count(), 1);
  });

  it("secret-hash AuthConfig check fires on secret change", async () => {
    const { getDb } = await import("./db/index.js");
    const stored = await getDb().authConfig.findUnique({
      where: { key: "secret_hash" },
    });
    assert.ok(stored?.value, "secret_hash row must exist after initAuth");

    // Fresh module instance with a different secret must reject.
    process.env.BETTER_AUTH_SECRET = "different-secret-9876543210fedcba";
    const fresh = await import("./auth.js?t=" + Date.now());
    await assert.rejects(
      () => fresh.initAuth(),
      (err: Error) => err.message.includes("BETTER_AUTH_SECRET mismatch"),
    );
    process.env.BETTER_AUTH_SECRET = originalSecret || "test-secret-0123456789abcdef0123456789abcdef";
  });
});
