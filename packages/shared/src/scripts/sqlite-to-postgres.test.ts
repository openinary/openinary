import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import BetterSqlite3 from "better-sqlite3";

import { createAuth } from "../auth";
import { readAuthPolicy } from "../auth-config";
import { type Database, kvGet, kvSet, sql } from "../db";
import { createTestSchema, openPostgresTestDatabase, openSqliteTestDatabase, testDatabaseUrl } from "../testing";
import { CopyError, type CopyReport, copySqliteToPostgres, main, toBool, toDate } from "./sqlite-to-postgres";

const SECRET = "y".repeat(32);
// Generated per run: throwaway accounts in temp databases, never a real credential.
const throwawayLogin = `T1!${randomUUID()}`;
const HOUR = 3_600_000;
const quiet = () => {};

const skipPostgres = testDatabaseUrl()
  ? undefined
  : "TEST_DATABASE_URL is not set (e.g. postgres://postgres@localhost:55432/postgres); skipping Postgres";

/** The copy into a fresh schema of the test server; returns the report and the schema. */
async function copyInto(from: string, extra: { schema?: string; dryRun?: boolean; truncate?: boolean; batchSize?: number } = {}) {
  const schema = extra.schema ?? (await createTestSchema());
  const report = await copySqliteToPostgres({ from, to: testDatabaseUrl()!, log: quiet, ...extra, schema });
  return { report, schema };
}

const count = async (db: Database, table: "user" | "session" | "account" | "apiKey" | "video_jobs" | "delivery_log" | "delivery_counts" | "verification" | "app_state") =>
  Number((await db.selectFrom(table).select((eb) => eb.fn.countAll().as("n")).executeTakeFirstOrThrow()).n);

const byTable = (report: CopyReport) => Object.fromEntries(report.tables.map((t) => [t.table, t]));

/**
 * A SQLite instance as a real one ends up: accounts made through Better Auth
 * (admin, viewer, a banned member, an SSO user: four), API keys, sessions, videos
 * in every state, settings and delivery logs.
 */
async function realisticSource() {
  const db = await openSqliteTestDatabase();
  const auth = createAuth(db, SECRET, readAuthPolicy({}));
  const { user: owner } = await auth.api.signUpEmail({
    body: { email: "owner@acme.com", password: throwawayLogin, name: "Owner" },
  });
  const { user: viewer } = await auth.api.createUser({
    body: { email: "viewer@acme.com", password: throwawayLogin, name: "Viewer" },
  });
  const { user: banned } = await auth.api.createUser({
    body: { email: "banned@acme.com", password: throwawayLogin, name: "Banned", role: "member" },
  });
  const banExpires = new Date(Date.now() + 7 * 24 * HOUR);
  await db
    .updateTable("user")
    .set({ banned: 1, banReason: "spam", banExpires: banExpires.toISOString() })
    .where("id", "=", banned.id)
    .execute();

  // An SSO-only user, as the OAuth callback leaves it.
  const now = new Date().toISOString();
  const ssoId = randomUUID();
  await db
    .insertInto("user")
    .values({ id: ssoId, email: "sso@acme.com", emailVerified: 1, name: "Sso", role: "member", createdAt: now, updatedAt: now })
    .execute();
  await db
    .insertInto("account")
    .values({
      id: randomUUID(),
      userId: ssoId,
      accountId: "google-sub-1",
      providerId: "google",
      idToken: "header.payload.signature",
      accessTokenExpiresAt: new Date(Date.now() + HOUR).toISOString(),
      scope: "openid email profile",
      createdAt: now,
      updatedAt: now,
    })
    .execute();

  // Sessions from real sign-ins.
  await auth.api.signInEmail({ body: { email: "owner@acme.com", password: throwawayLogin } });
  await auth.api.signInEmail({ body: { email: "viewer@acme.com", password: throwawayLogin } });

  const { key, id: keyId } = await auth.api.createApiKey({ body: { userId: owner.id, name: "ci" } });
  await auth.api.createApiKey({ body: { userId: owner.id, name: "expiring", expiresIn: 24 * 3600 } });

  await db
    .insertInto("verification")
    .values({ id: randomUUID(), identifier: "reset:owner", value: "token", expiresAt: new Date(Date.now() + HOUR).toISOString(), createdAt: now, updatedAt: now })
    .execute();

  const t0 = Date.now() - 5 * HOUR;
  for (const [i, status] of (["pending", "processing", "completed", "error", "cancelled"] as const).entries()) {
    await db
      .insertInto("video_jobs")
      .values({
        id: `job-${i}`,
        file_path: `videos/${i}.mp4`,
        params_json: JSON.stringify({ w: 640 }),
        cache_path: `cache/${i}.mp4`,
        status,
        progress: status === "completed" ? 100 : 40,
        error: status === "error" ? "ffmpeg exited with 1" : null,
        created_at: t0 + i,
        started_at: status === "pending" ? null : t0 + i + 10,
        completed_at: status === "completed" ? t0 + i + 20 : null,
      })
      .execute();
  }

  await kvSet(db, "secret_hash", createHash("sha256").update(SECRET).digest("hex"));
  await kvSet(db, "workspace", JSON.stringify({ name: "Acme" }));
  await kvSet(db, "onboarding:upload", "done");
  await kvSet(db, "setup_claim", String(Date.now()));

  for (let i = 0; i < 1200; i++) {
    await db
      .insertInto("delivery_log")
      .values({ t: t0 + i * 1000, path: `/t/w_100/${i}.jpg`, kind: i % 3 ? "image" : "video", status: i % 10 ? 200 : 404 })
      .execute();
  }
  for (let h = 0; h < 5; h++) {
    await db.insertInto("delivery_counts").values({ hour: Math.floor(t0 / HOUR) * HOUR + h * HOUR, kind: "image", delivered: 10 + h, failed: h }).execute();
  }

  return { db, path: db.location, owner, viewer, banned, banExpires, ssoId, key, keyId };
}

/** A volume from an older release: pre-roles schema, apiKey.userId, epoch-ms timestamps, and orphans. */
function legacySource(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openinary-legacy-"));
  const file = path.join(dir, "auth.db");
  const raw = new BetterSqlite3(file);
  const created = Date.UTC(2024, 0, 15, 12, 0, 0);
  raw.exec(`
    CREATE TABLE user (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, emailVerified INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, image TEXT, twoFactorEnabled INTEGER DEFAULT 0);
    CREATE TABLE session (id TEXT PRIMARY KEY, userId TEXT NOT NULL, expiresAt INTEGER NOT NULL, token TEXT NOT NULL UNIQUE,
      createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, ipAddress TEXT, userAgent TEXT);
    CREATE TABLE account (id TEXT PRIMARY KEY, userId TEXT NOT NULL, accountId TEXT NOT NULL, providerId TEXT NOT NULL,
      accessToken TEXT, refreshToken TEXT, idToken TEXT, accessTokenExpiresAt INTEGER, refreshTokenExpiresAt INTEGER,
      scope TEXT, password TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL);
    CREATE TABLE apiKey (id TEXT PRIMARY KEY, name TEXT, start TEXT, prefix TEXT, key TEXT NOT NULL, userId TEXT NOT NULL,
      refillInterval INTEGER, refillAmount INTEGER, lastRefillAt INTEGER, enabled INTEGER NOT NULL DEFAULT 1,
      rateLimitEnabled INTEGER NOT NULL DEFAULT 1, rateLimitTimeWindow INTEGER, rateLimitMax INTEGER,
      requestCount INTEGER NOT NULL DEFAULT 0, remaining INTEGER, lastRequest INTEGER, expiresAt INTEGER,
      createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, permissions TEXT, metadata TEXT);
    CREATE TABLE _auth_config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO _auth_config VALUES ('legacy_setting', 'kept');
  `);
  raw.prepare("INSERT INTO user VALUES ('u1', 'old@acme.com', 0, 'Old', ?, ?, NULL, 1)").run(created, created);
  raw.prepare("INSERT INTO session VALUES ('s1', 'u1', ?, 'tok-1', ?, ?, NULL, NULL)").run(created + HOUR, created, created);
  // Orphans: their user was deleted while SQLite didn't enforce foreign keys.
  raw.prepare("INSERT INTO session VALUES ('s2', 'gone', ?, 'tok-2', ?, ?, NULL, NULL)").run(created + HOUR, created, created);
  raw.prepare("INSERT INTO session VALUES ('s3', 'gone', ?, 'tok-3', ?, ?, NULL, NULL)").run(created + HOUR, created, created);
  raw
    .prepare("INSERT INTO account VALUES ('a1', 'u1', 'u1', 'credential', NULL, NULL, NULL, NULL, NULL, NULL, 'hash', ?, ?)")
    .run(created, created);
  raw
    .prepare("INSERT INTO account VALUES ('a2', 'gone', 'gone', 'credential', NULL, NULL, NULL, NULL, NULL, NULL, 'hash', ?, ?)")
    .run(created, created);
  raw
    .prepare(
      "INSERT INTO apiKey VALUES ('k1', 'old', 'opk_', 'opk_', 'hashed', 'u1', NULL, NULL, NULL, 1, 0, 60000, 100, 7, NULL, ?, NULL, ?, ?, NULL, NULL)",
    )
    .run(created + 1000, created, created);
  raw
    .prepare(
      "INSERT INTO apiKey VALUES ('k2', 'orphan', NULL, NULL, 'hashed2', 'gone', NULL, NULL, NULL, 0, 1, NULL, NULL, 0, NULL, NULL, NULL, ?, ?, NULL, NULL)",
    )
    .run(created, created);
  raw.close();
  return file;
}

describe("conversions", () => {
  test("timestamps: ISO text, epoch ms (number or text), SQLite datetime (UTC), null", () => {
    const ms = Date.UTC(2024, 0, 15, 12, 0, 0);
    assert.equal(toDate(ms)?.getTime(), ms);
    assert.equal(toDate(String(ms))?.getTime(), ms);
    assert.equal(toDate(new Date(ms).toISOString())?.getTime(), ms);
    assert.equal(toDate("2024-01-15 12:00:00")?.getTime(), ms);
    assert.equal(toDate(null), null);
    assert.equal(toDate("not a date"), undefined);
  });

  test("booleans: 0/1, true/false, null; anything else is invalid", () => {
    assert.equal(toBool(1), true);
    assert.equal(toBool(0), false);
    assert.equal(toBool("true"), true);
    assert.equal(toBool(null), null);
    assert.equal(toBool(2), undefined);
  });
});

describe("CLI", () => {
  test("needs a Postgres target", async () => {
    const errors: string[] = [];
    const original = console.error;
    console.error = (line: string) => errors.push(line);
    try {
      assert.equal(await main(["--from", "/nowhere.db"], {}), 2);
      assert.equal(await main(["--from", "/nowhere.db", "--to", "mysql://localhost/x"], {}), 2);
      assert.equal(await main(["--bogus"], {}), 2);
    } finally {
      console.error = original;
    }
    assert.match(errors.join("\n"), /set DATABASE_URL/);
  });

  test("a missing source fails before connecting anywhere", async () => {
    await assert.rejects(
      copySqliteToPostgres({ from: "/nowhere/auth.db", to: "postgres://nobody@127.0.0.1:1/x", log: quiet }),
      (error: unknown) => error instanceof CopyError && /No SQLite database/.test(error.message),
    );
  });
});

describe("copy into Postgres", { skip: skipPostgres }, () => {
  test("copies everything, and Better Auth on Postgres accepts the old password and API key", async () => {
    const src = await realisticSource();
    const { report, schema } = await copyInto(src.path, { batchSize: 100 });
    const target = await openPostgresTestDatabase(schema);

    const tables = byTable(report);
    for (const table of ["user", "session", "account", "verification", "apiKey", "video_jobs", "delivery_log", "delivery_counts"] as const) {
      assert.equal(await count(target, table), await count(src.db, table), table);
      assert.equal(tables[table]!.copied, await count(src.db, table), table);
      assert.equal(tables[table]!.skipped, 0);
    }
    assert.equal(tables.delivery_log!.copied, 1200);

    // Roles, bans, booleans and timestamps.
    const users = await target.selectFrom("user").selectAll().orderBy("email").execute();
    const role = (email: string) => users.find((u) => u.email === email)?.role;
    assert.equal(role("owner@acme.com"), "admin");
    assert.equal(role("viewer@acme.com"), "viewer");
    assert.equal(role("banned@acme.com"), "member");
    assert.equal(role("sso@acme.com"), "member");
    const banned = users.find((u) => u.email === "banned@acme.com")!;
    assert.equal(banned.banned, true);
    assert.equal(banned.banReason, "spam");
    assert.ok(banned.banExpires instanceof Date);
    assert.equal(banned.banExpires.getTime(), src.banExpires.getTime());
    assert.equal(users.find((u) => u.email === "owner@acme.com")!.banned, false);
    assert.equal(users.find((u) => u.email === "owner@acme.com")!.emailVerified, true);
    assert.ok(users.every((u) => u.createdAt instanceof Date));

    const sso = await target.selectFrom("account").selectAll().where("userId", "=", src.ssoId).executeTakeFirstOrThrow();
    assert.equal(sso.idToken, "header.payload.signature");
    assert.ok(sso.accessTokenExpiresAt instanceof Date);

    const apiKey = await target.selectFrom("apiKey").selectAll().where("id", "=", src.keyId).executeTakeFirstOrThrow();
    assert.equal(apiKey.enabled, true);
    assert.equal(typeof apiKey.rateLimitEnabled, "boolean");
    assert.ok(apiKey.createdAt instanceof Date);

    const jobs = await target.selectFrom("video_jobs").selectAll().orderBy("id").execute();
    assert.deepEqual(jobs.map((j) => j.status), ["pending", "processing", "completed", "error", "cancelled"]);
    assert.equal(typeof jobs[0]!.created_at, "number");
    assert.equal(jobs[0]!.started_at, null);
    assert.equal(jobs[2]!.completed_at, (await src.db.selectFrom("video_jobs").select("completed_at").where("id", "=", "job-2").executeTakeFirstOrThrow()).completed_at);

    // Settings: secret_hash and the rest, never setup_claim.
    assert.equal(await kvGet(target, "secret_hash"), await kvGet(src.db, "secret_hash"));
    assert.equal(await kvGet(target, "workspace"), JSON.stringify({ name: "Acme" }));
    assert.equal(await kvGet(target, "onboarding:upload"), "done");
    assert.equal(await kvGet(target, "setup_claim"), undefined);
    assert.equal(await kvGet(target, "schema_version"), "1");

    // The strongest proof: Better Auth on Postgres signs the copied user in
    // with the original password and accepts the original API key.
    const auth = createAuth(target, SECRET, readAuthPolicy({}));
    const signedIn = await auth.api.signInEmail({ body: { email: "viewer@acme.com", password: throwawayLogin } });
    assert.equal(signedIn.user.id, src.viewer.id);
    assert.equal((signedIn.user as { role?: string }).role, "viewer");
    await assert.rejects(auth.api.signInEmail({ body: { email: "banned@acme.com", password: throwawayLogin } }), /banned/i);
    const verified = await auth.api.verifyApiKey({ body: { key: src.key } });
    assert.equal(verified.valid, true);
    assert.equal(verified.key?.referenceId, src.owner.id);

    // New delivery lines continue after the copied ids.
    const maxId = Number((await target.selectFrom("delivery_log").select((eb) => eb.fn.max("id").as("m")).executeTakeFirstOrThrow()).m);
    const inserted = await target
      .insertInto("delivery_log")
      .values({ t: Date.now(), path: "/new.jpg", kind: "image", status: 200 })
      .returning("id")
      .executeTakeFirstOrThrow();
    assert.equal(Number(inserted.id), maxId + 1);

    // The trigger is back on for new sign-ups.
    const { rows } = await sql<{ tgenabled: string }>`
      SELECT tgenabled FROM pg_trigger WHERE tgname = 'first_user_is_admin' AND tgrelid = '"user"'::regclass
    `.execute(target);
    assert.equal(rows[0]?.tgenabled, "O");
  });

  test("roles arrive as they were: a lone viewer doesn't become admin", async () => {
    const src = await openSqliteTestDatabase();
    const now = new Date().toISOString();
    await src.insertInto("user").values({ id: "only", email: "only@acme.com", name: "Only", createdAt: now, updatedAt: now }).execute();
    await src.updateTable("user").set({ role: "viewer" }).where("id", "=", "only").execute();
    const { schema } = await copyInto(src.location, { batchSize: 1 });
    const target = await openPostgresTestDatabase(schema);
    assert.equal((await target.selectFrom("user").select("role").executeTakeFirstOrThrow()).role, "viewer");
  });

  test("an old volume is migrated in a temp copy, orphans are skipped, the source is untouched", async () => {
    const file = legacySource();
    const before = fs.readFileSync(file);
    const { report, schema } = await copyInto(file);
    assert.deepEqual(fs.readFileSync(file), before, "the source file is never written");

    const tables = byTable(report);
    assert.deepEqual([tables.session!.source, tables.session!.skipped, tables.session!.copied], [3, 2, 1]);
    assert.deepEqual([tables.account!.skipped, tables.account!.copied], [1, 1]);
    assert.deepEqual([tables.apiKey!.skipped, tables.apiKey!.copied], [1, 1]);
    assert.ok(report.notes.some((n) => n.includes("user.twoFactorEnabled")));

    const target = await openPostgresTestDatabase(schema);
    const user = await target.selectFrom("user").selectAll().executeTakeFirstOrThrow();
    // Pre-roles volumes made their only account admin; it was a credential
    // account, so the backfill marked it verified.
    assert.equal(user.role, "admin");
    assert.equal(user.emailVerified, true);
    assert.equal(user.banned, false);
    assert.equal((user.createdAt as Date).toISOString(), "2024-01-15T12:00:00.000Z");
    const key = await target.selectFrom("apiKey").selectAll().executeTakeFirstOrThrow();
    assert.equal(key.referenceId, "u1");
    assert.equal(key.configId, "default");
    assert.equal(key.rateLimitEnabled, false);
    assert.equal(key.requestCount, 7);
    assert.equal(key.lastRefillAt, null);
    assert.equal((key.lastRequest as Date).getTime(), Date.UTC(2024, 0, 15, 12, 0, 1));
    assert.equal(await kvGet(target, "legacy_setting"), "kept");
    assert.equal(await count(target, "session"), 1);
  });

  test("refuses a target with data unless --truncate, which replaces it; reruns give the same result", async () => {
    const src = await realisticSource();
    const { schema } = await copyInto(src.path);
    await assert.rejects(copyInto(src.path, { schema }), (error: unknown) => {
      assert.ok(error instanceof CopyError);
      assert.match(error.message, /already holds data/);
      assert.match(error.message, /user: 4 row\(s\)/);
      return true;
    });

    const target = await openPostgresTestDatabase(schema);
    // Something written on the target since: --truncate drops it.
    await kvSet(target, "instance_id", "target-only");
    const { report } = await copyInto(src.path, { schema, truncate: true });
    assert.ok(report.tables.every((t) => t.target === t.source - t.skipped));
    assert.equal(await count(target, "user"), 4);
    assert.equal(await count(target, "delivery_log"), 1200);
    assert.equal(await kvGet(target, "instance_id"), undefined);
    assert.equal(await kvGet(target, "schema_version"), "1");
  });

  test("--dry-run verifies everything and keeps nothing", async () => {
    const src = await realisticSource();
    const { report, schema } = await copyInto(src.path, { dryRun: true });
    assert.equal(report.dryRun, true);
    assert.equal(byTable(report).user!.target, 4);
    assert.equal(byTable(report).delivery_log!.target, 1200);
    const target = await openPostgresTestDatabase(schema);
    for (const table of ["user", "session", "account", "apiKey", "video_jobs", "delivery_log", "delivery_counts"] as const) {
      assert.equal(await count(target, table), 0, table);
    }
    assert.equal(await kvGet(target, "secret_hash"), undefined);
    // The trigger was re-enabled by the rollback too.
    const { rows } = await sql<{ tgenabled: string }>`
      SELECT tgenabled FROM pg_trigger WHERE tgname = 'first_user_is_admin' AND tgrelid = '"user"'::regclass
    `.execute(target);
    assert.equal(rows[0]?.tgenabled, "O");
  });

  test("a value Postgres can't take fails the whole copy, naming the row", async () => {
    const src = await openSqliteTestDatabase();
    const now = new Date().toISOString();
    await src.insertInto("user").values({ id: "u1", email: "a@acme.com", name: "A", createdAt: now, updatedAt: now }).execute();
    await src.insertInto("user").values({ id: "u2", email: "b@acme.com", name: "B", createdAt: "garbage", updatedAt: now }).execute();
    const schema = await createTestSchema();
    await assert.rejects(
      copyInto(src.location, { schema }),
      (error: unknown) => error instanceof CopyError && /user \(id "u2"\): column "createdAt"/.test(error.message),
    );
    const target = await openPostgresTestDatabase(schema);
    assert.equal(await count(target, "user"), 0);
  });

  test("the CLI never prints the database password", async () => {
    const src = await realisticSource();
    const schema = await createTestSchema();
    // The test server trusts local connections, so any password works; a fresh one per run.
    const password = randomUUID();
    const url = new URL(testDatabaseUrl()!);
    url.password = password;
    const lines: string[] = [];
    const original = { log: console.log, error: console.error };
    console.log = (line: string) => lines.push(String(line));
    console.error = (line: string) => lines.push(String(line));
    let code: number;
    try {
      code = await main(["--", "--from", src.path, "--to", url.toString(), "--schema", schema, "--dry-run"], {});
    } finally {
      Object.assign(console, original);
    }
    const output = lines.join("\n");
    assert.equal(code, 0, output);
    assert.ok(!output.includes(password), "password redacted");
    assert.match(output, /\*\*\*/);
    assert.match(output, /Dry run/);
  });
});
