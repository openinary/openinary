import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { randomUUID } from "node:crypto";
import BetterSqlite3 from "better-sqlite3";

import { createTestSchema, openPostgresTestDatabase, testDatabaseUrl, testDialects } from "../testing";
import {
  claimSetup,
  closeDatabase,
  type Database,
  getDatabase,
  getUserAccess,
  hasAdmin,
  kvGet,
  kvInit,
  kvSet,
  migrate,
  openDatabase,
  resolveDatabaseConfig,
  resolveDbPath,
  SCHEMA_VERSION,
  sql,
} from "./index";
import { redactUrl, urlSecrets } from "./postgres";

const ISO = new Date(0).toISOString();

const insertUser = (db: Database, id: string, extra: { role?: string } = {}) =>
  db
    .insertInto("user")
    .values({ id, email: `${id}@example.com`, name: id, createdAt: ISO, updatedAt: ISO, ...extra })
    .execute();

const roleOf = async (db: Database, id: string) =>
  (await db.selectFrom("user").select("role").where("id", "=", id).executeTakeFirstOrThrow()).role;

const userCount = async (db: Database) =>
  Number((await db.selectFrom("user").select((eb) => eb.fn.countAll().as("n")).executeTakeFirstOrThrow()).n);

describe("resolveDatabaseConfig", () => {
  test("no DATABASE_URL is SQLite at DB_PATH, or the default path", () => {
    assert.deepEqual(resolveDatabaseConfig({ DB_PATH: "/data/auth.db" }), { dialect: "sqlite", path: "/data/auth.db" });
    assert.deepEqual(resolveDatabaseConfig({}), { dialect: "sqlite", path: resolveDbPath({}) });
    assert.match(resolveDbPath({}), /data[/\\]auth\.db$/);
    // compose files often pass an empty value
    assert.equal(resolveDatabaseConfig({ DATABASE_URL: "  ", DB_PATH: "/x.db" }).dialect, "sqlite");
  });

  test("a postgres:// or postgresql:// URL is Postgres, with a pool size", () => {
    const host = `db-${process.pid}.internal`;
    for (const scheme of ["postgres", "postgresql", "POSTGRES"]) {
      const url = `${scheme}://app@${host}:5432/openinary?sslmode=verify-full`;
      assert.deepEqual(resolveDatabaseConfig({ DATABASE_URL: url, DB_PATH: "/ignored.db" }), {
        dialect: "postgres",
        url,
        poolMax: 5,
      });
    }
    const url = `postgres://app@${host}/openinary`;
    assert.equal((resolveDatabaseConfig({ DATABASE_URL: url, DATABASE_POOL_MAX: "25" }) as { poolMax: number }).poolMax, 25);
  });

  test("anything else is a clear startup error", () => {
    for (const DATABASE_URL of ["mysql://app@db/openinary", "sqlite:///data/auth.db", "/data/auth.db", "file:auth.db"]) {
      assert.throws(() => resolveDatabaseConfig({ DATABASE_URL }), /DATABASE_URL must be a Postgres URL/);
    }
    assert.throws(() => resolveDatabaseConfig({ DATABASE_URL: "mysql://db/x" }), /"mysql:" URL/);
    for (const DATABASE_POOL_MAX of ["0", "-1", "ten", "2.5"]) {
      assert.throws(
        () => resolveDatabaseConfig({ DATABASE_URL: "postgres://db/x", DATABASE_POOL_MAX }),
        /DATABASE_POOL_MAX must be a positive integer/,
      );
    }
  });

  test("an invalid schema name is refused before connecting", async () => {
    await assert.rejects(
      openDatabase({ dialect: "postgres", url: "postgres://db.invalid/x", poolMax: 1, schema: "a; DROP" }),
      /Invalid Postgres schema name/,
    );
  });
});

describe("redactUrl", () => {
  // Generated per run, so no credential-looking literal sits in the source.
  const secret = randomUUID();
  const other = randomUUID();
  const host = `db-${process.pid}.internal`;

  test("hides the userinfo password", () => {
    const out = redactUrl(`postgres://app:${secret}@${host}:5432/openinary`);
    assert.ok(!out.includes(secret), out);
    assert.match(out, /app:\*\*\*@/);
    assert.ok(out.includes(host));
  });

  test("hides password and sslpassword query parameters, keeps the rest", () => {
    const out = redactUrl(
      `postgres://app@${host}/openinary?sslmode=verify-full&password=${secret}&sslpassword=${other}&sslkey=/certs/client.key&application_name=web`,
    );
    assert.ok(!out.includes(secret), out);
    assert.ok(!out.includes(other), out);
    const params = new URL(out).searchParams;
    assert.equal(params.get("password"), "***");
    assert.equal(params.get("sslpassword"), "***");
    assert.equal(params.get("sslmode"), "verify-full");
    assert.equal(params.get("sslkey"), "/certs/client.key");
    assert.equal(params.get("application_name"), "web");
  });

  test("a URL without secrets is unchanged, an unparseable one is hidden", () => {
    const url = `postgres://app@${host}:5432/openinary?sslmode=require`;
    assert.equal(redactUrl(url), url);
    assert.equal(redactUrl(`postgres://app:${secret}@[bad`), "postgres://(unparseable URL)");
  });

  test("urlSecrets lists every secret, for scrubbing error messages", () => {
    assert.deepEqual(urlSecrets(`postgres://app:${secret}@${host}/db?password=${other}`), [secret, other]);
    assert.deepEqual(urlSecrets(`postgres://app@${host}/db?sslmode=require`), []);
  });
});

test("only the SQLite dialect modules load better-sqlite3", () => {
  const src = path.resolve(import.meta.dirname, "..");
  const files = fs.readdirSync(src, { recursive: true, encoding: "utf8" }).filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f));
  const importers = files.filter((f) => /from "better-sqlite3"|import\("better-sqlite3"\)/.test(fs.readFileSync(path.join(src, f), "utf8")));
  // The copy script reads a SQLite file by nature. It's a standalone CLI that
  // nothing in the app imports (checked below), so a Postgres deployment still
  // never loads better-sqlite3.
  assert.deepEqual(importers.map((f) => f.split(path.sep).join("/")).sort(), [
    "db/migrate-sqlite.ts",
    "db/sqlite.ts",
    "scripts/sqlite-to-postgres.ts",
  ]);
  const scriptImporters = files.filter(
    (f) => !f.startsWith(`scripts${path.sep}`) && /from "\.{1,2}\/(\.\.\/)*scripts\//.test(fs.readFileSync(path.join(src, f), "utf8")),
  );
  assert.deepEqual(scriptImporters, [], "app code must not import the scripts");
  // And index.ts reaches the dialect modules only through a dynamic import.
  assert.doesNotMatch(fs.readFileSync(path.join(src, "db/index.ts"), "utf8"), /^import [^\n]*"\.\/(sqlite|migrate-sqlite)"/m);
});

test("getDatabase opens once for concurrent callers, and retries after a failed open", async () => {
  const saved = { url: process.env.DATABASE_URL, path: process.env.DB_PATH };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openinary-shared-"));
  try {
    process.env.DATABASE_URL = "mysql://nowhere/x";
    await assert.rejects(getDatabase(), /DATABASE_URL must be a Postgres URL/);
    delete process.env.DATABASE_URL;
    process.env.DB_PATH = path.join(dir, "auth.db");
    const [a, b] = await Promise.all([getDatabase(), getDatabase()]);
    assert.equal(a, b);
    assert.equal(a.location, process.env.DB_PATH);
    assert.equal(await getDatabase(), a);
    await closeDatabase();
    const c = await getDatabase();
    assert.notEqual(c, a);
    await closeDatabase();
  } finally {
    for (const [key, value] of [["DATABASE_URL", saved.url], ["DB_PATH", saved.path]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

for (const dialect of testDialects()) {
  describe(dialect.name, { skip: dialect.skip }, () => {
    test("migrate is idempotent and records the schema version", async () => {
      const db = await dialect.open();
      assert.equal(db.dialect, dialect.name);
      await insertUser(db, "u1");
      await kvSet(db, "workspace", '{"name":"Acme"}');
      await migrate(db);
      await migrate(db);
      assert.equal(await kvGet(db, "schema_version"), String(SCHEMA_VERSION));
      assert.equal(await kvGet(db, "workspace"), '{"name":"Acme"}');
      assert.equal(await userCount(db), 1);
      assert.equal(await roleOf(db, "u1"), "admin");
    });

    test("on a fresh instance only the first account becomes admin", async () => {
      const db = await dialect.open();
      assert.equal(await hasAdmin(db), false);
      await insertUser(db, "first");
      await insertUser(db, "second", { role: "viewer" });
      await insertUser(db, "third");
      assert.equal(await hasAdmin(db), true);
      assert.equal(await roleOf(db, "first"), "admin");
      assert.equal(await roleOf(db, "second"), "viewer");
      assert.equal(await roleOf(db, "third"), null);

      // Re-running never re-promotes anyone or touches roles.
      await migrate(db);
      await migrate(db);
      assert.equal(await roleOf(db, "second"), "viewer");
      assert.equal(await roleOf(db, "third"), null);
    });

    test("accounts inserted at once on a fresh instance: exactly one admin", async () => {
      const db = await dialect.open();
      const ids = ["a", "b", "c", "d", "e", "f"];
      await Promise.all(ids.map((id) => insertUser(db, id)));
      const roles = await Promise.all(ids.map((id) => roleOf(db, id)));
      assert.equal(roles.filter((r) => r === "admin").length, 1);
    });

    test("getUserAccess reads role and ban, and an expired ban no longer counts", async () => {
      const db = await dialect.open();
      for (const id of ["a", "b", "c", "d"]) await insertUser(db, id);
      const ban = (id: string, banExpires: string | null) =>
        db.updateTable("user").set({ role: "member", banned: 1, banExpires }).where("id", "=", id).execute();
      await ban("b", null);
      await ban("c", new Date(Date.now() - 1000).toISOString());
      await ban("d", new Date(Date.now() + 60_000).toISOString());

      assert.deepEqual(await getUserAccess("a", db), {
        id: "a",
        email: "a@example.com",
        name: "a",
        role: "admin",
        banned: false,
      });
      assert.equal((await getUserAccess("b", db))?.banned, true);
      assert.equal((await getUserAccess("c", db))?.banned, false);
      assert.equal((await getUserAccess("d", db))?.banned, true);
      assert.equal((await getUserAccess("b", db))?.role, "member");
      assert.equal(await getUserAccess("missing", db), undefined);
    });

    test("kv helpers get, set, and init without overwriting", async () => {
      const db = await dialect.open();
      assert.equal(await kvGet(db, "k"), undefined);
      assert.equal(await kvInit(db, "k", "first"), "first");
      assert.equal(await kvInit(db, "k", "second"), "first");
      await kvSet(db, "k", "third");
      assert.equal(await kvGet(db, "k"), "third");
      await kvSet(db, "k", "");
      assert.equal(await kvGet(db, "k"), "");
      // Concurrent inits agree on one value.
      const values = await Promise.all(["x", "y", "z"].map((v) => kvInit(db, "race", v)));
      assert.equal(new Set(values).size, 1);
    });

    test("the setup claim is single-use, frees itself after a minute, and closes with an account", async () => {
      const db = await dialect.open();
      assert.equal(await claimSetup(db, 1_000_000), true);
      assert.equal(await claimSetup(db, 1_000_000), false);
      assert.equal(await claimSetup(db, 1_030_000), false);
      assert.equal(await claimSetup(db, 1_061_000), true, "a stale claim with no account is free again");
      await insertUser(db, "u");
      assert.equal(await claimSetup(db, 9_000_000), false);
      // Real clock values (13 digits) compare as integers, not text.
      const now = Date.now();
      const fresh = await dialect.open();
      assert.equal(await claimSetup(fresh, now), true);
      assert.equal(await claimSetup(fresh, now + 59_000), false);
      assert.equal(await claimSetup(fresh, now + 61_000), true);
    });

    test("setup claims racing: exactly one wins", async () => {
      const db = await dialect.open();
      const results = await Promise.all(Array.from({ length: 8 }, () => claimSetup(db, Date.now())));
      assert.equal(results.filter(Boolean).length, 1);
    });

    test("epoch-ms BIGINT columns, COUNT and SUM come back as numbers", async () => {
      const db = await dialect.open();
      // The largest valid JS date, ~8.64e15: past 2^32, below 2^53.
      const far = 8_640_000_000_000_000;
      const now = Date.now();
      await db
        .insertInto("video_jobs")
        .values([
          { id: "j1", file_path: "a.mp4", params_json: "{}", cache_path: "c1", status: "pending", created_at: now },
          { id: "j2", file_path: "b.mp4", params_json: "{}", cache_path: "c2", status: "completed", created_at: far, completed_at: far },
        ])
        .execute();
      const rows = await db.selectFrom("video_jobs").select(["id", "created_at", "completed_at", "priority"]).orderBy("id").execute();
      assert.deepEqual(rows, [
        { id: "j1", created_at: now, completed_at: null, priority: 2 },
        { id: "j2", created_at: far, completed_at: far, priority: 2 },
      ]);
      await db
        .insertInto("delivery_counts")
        .values([
          { hour: 3_600_000, kind: "image", delivered: 5, failed: 1 },
          { hour: 7_200_000, kind: "image", delivered: 7, failed: 0 },
        ])
        .execute();
      const totals = await db
        .selectFrom("delivery_counts")
        .select((eb) => [eb.fn.countAll().as("n"), eb.fn.sum("delivered").as("delivered"), eb.fn.max("hour").as("last")])
        .executeTakeFirstOrThrow();
      assert.deepEqual(totals, { n: 2, delivered: 12, last: 7_200_000 });
      const { id } = await db
        .insertInto("delivery_log")
        .values({ t: now, path: "/x.jpg", kind: "image", status: 200 })
        .returning("id")
        .executeTakeFirstOrThrow();
      assert.equal(typeof id, "number");
      const raw = await sql<{ t: number }>`SELECT t FROM delivery_log WHERE id = ${id}`.execute(db);
      assert.deepEqual(raw.rows, [{ t: now }]);
    });

    test("Better Auth's boolean and timestamp columns take 0/1 and ISO strings", async () => {
      const db = await dialect.open();
      await insertUser(db, "u");
      const when = new Date("2030-01-02T03:04:05.678Z");
      await db
        .updateTable("user")
        .set({ emailVerified: 1, banned: 0, banExpires: when.toISOString() })
        .where("id", "=", "u")
        .execute();
      const row = await db
        .selectFrom("user")
        .select(["emailVerified", "banned", "banExpires"])
        .where("id", "=", "u")
        .executeTakeFirstOrThrow();
      assert.equal(!!row.emailVerified, true);
      assert.equal(!!row.banned, false);
      assert.equal(new Date(row.banExpires!).getTime(), when.getTime());
      const verified = await db.selectFrom("user").select("id").where("emailVerified", "=", 1).execute();
      assert.deepEqual(verified, [{ id: "u" }]);
    });

    test("deleting a user removes their sessions, accounts and API keys", async () => {
      const db = await dialect.open();
      await insertUser(db, "u");
      await db
        .insertInto("session")
        .values({ id: "s", userId: "u", token: "t", expiresAt: ISO, createdAt: ISO, updatedAt: ISO })
        .execute();
      await db
        .insertInto("account")
        .values({ id: "a", userId: "u", accountId: "u", providerId: "credential", createdAt: ISO, updatedAt: ISO })
        .execute();
      await db
        .insertInto("apiKey")
        .values({ id: "k", key: "hash", referenceId: "u", createdAt: ISO, updatedAt: ISO })
        .execute();
      if (db.dialect === "sqlite") await sql`PRAGMA foreign_keys = ON`.execute(db);
      await db.deleteFrom("user").where("id", "=", "u").execute();
      for (const table of ["session", "account", "apiKey"] as const) {
        assert.equal((await db.selectFrom(table).select("id").execute()).length, 0, table);
      }
    });
  });
}

describe("postgres only", { skip: testDatabaseUrl() ? undefined : "TEST_DATABASE_URL is not set" }, () => {
  test("nodes migrating the same schema at once: no error, one schema", async () => {
    const schema = await createTestSchema();
    const dbs = await Promise.all(Array.from({ length: 4 }, () => openPostgresTestDatabase(schema)));
    const [db] = dbs;
    const { rows } = await sql<{ n: number }>`
      SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ${schema}
    `.execute(db!);
    assert.equal(rows[0]!.n, 9);
    const versions = await db!.selectFrom("app_state").selectAll().where("key", "=", "schema_version").execute();
    assert.deepEqual(versions, [{ key: "schema_version", value: String(SCHEMA_VERSION) }]);
    const triggers = await sql<{ n: number }>`
      SELECT COUNT(*) AS n FROM information_schema.triggers WHERE trigger_schema = ${schema}
    `.execute(db!);
    assert.equal(triggers.rows[0]!.n, 1);
  });

  test("two first sign-ups in overlapping transactions: only one becomes admin", async () => {
    const schema = await createTestSchema();
    const a = await openPostgresTestDatabase(schema);
    const b = await openPostgresTestDatabase(schema);
    let releaseA!: () => void;
    const aMayCommit = new Promise<void>((resolve) => (releaseA = resolve));
    let aInserted!: () => void;
    const aHasInserted = new Promise<void>((resolve) => (aInserted = resolve));

    const txA = a.transaction().execute(async (trx) => {
      await trx.insertInto("user").values({ id: "a", email: "a@x.y", name: "a", createdAt: ISO, updatedAt: ISO }).execute();
      aInserted();
      await aMayCommit;
    });
    await aHasInserted;
    // B's insert goes through but its trigger waits on A's lock.
    const txB = b.transaction().execute(async (trx) => {
      await trx.insertInto("user").values({ id: "b", email: "b@x.y", name: "b", createdAt: ISO, updatedAt: ISO }).execute();
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    releaseA();
    await Promise.all([txA, txB]);
    assert.equal(await roleOf(a, "a"), "admin");
    assert.equal(await roleOf(a, "b"), null);
  });
});

describe("sqlite only", () => {
  const dirs: string[] = [];
  after(() => {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
  });
  /** A volume an older release left behind: a file made with raw SQL, before openDatabase ever saw it. */
  const legacyFile = (setup: string) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openinary-legacy-"));
    dirs.push(dir);
    const file = path.join(dir, "auth.db");
    const raw = new BetterSqlite3(file);
    if (setup) raw.exec(setup);
    raw.close();
    return file;
  };
  const withRaw = (file: string, fn: (raw: BetterSqlite3.Database) => void) => {
    const raw = new BetterSqlite3(file);
    try {
      fn(raw);
    } finally {
      raw.close();
    }
  };

  test("an older volume keeps its settings and API keys", async () => {
    const file = legacyFile(`
      CREATE TABLE user (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, emailVerified INTEGER NOT NULL DEFAULT 0,
        name TEXT NOT NULL, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, image TEXT, twoFactorEnabled INTEGER DEFAULT 0);
      CREATE TABLE apiKey (id TEXT PRIMARY KEY, name TEXT, start TEXT, prefix TEXT, key TEXT NOT NULL, userId TEXT NOT NULL,
        refillInterval INTEGER, refillAmount INTEGER, lastRefillAt INTEGER, enabled INTEGER NOT NULL DEFAULT 1,
        rateLimitEnabled INTEGER NOT NULL DEFAULT 1, rateLimitTimeWindow INTEGER, rateLimitMax INTEGER,
        requestCount INTEGER NOT NULL DEFAULT 0, remaining INTEGER, lastRequest INTEGER, expiresAt INTEGER,
        createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, permissions TEXT, metadata TEXT);
      CREATE TABLE _auth_config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE _telemetry_config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO user VALUES ('u1', 'a@b.c', 0, 'A', 1, 1, NULL, 0);
      INSERT INTO apiKey (id, key, userId, createdAt, updatedAt) VALUES ('k1', 'hash', 'u1', 1, 1);
      INSERT INTO _auth_config VALUES ('secret_hash', 'abc');
      INSERT INTO _telemetry_config VALUES ('instance_id', 'id-1');
      INSERT INTO app_state VALUES ('workspace', '{"name":"Acme"}');
    `);

    const db = await openDatabase({ dialect: "sqlite", path: file });
    try {
      await migrate(db);
      assert.equal(await kvGet(db, "secret_hash"), "abc");
      assert.equal(await kvGet(db, "instance_id"), "id-1");
      assert.equal(await kvGet(db, "workspace"), '{"name":"Acme"}');
      assert.equal(await kvGet(db, "schema_version"), String(SCHEMA_VERSION));
      assert.deepEqual(await db.selectFrom("apiKey").select(["id", "referenceId"]).execute(), [
        { id: "k1", referenceId: "u1" },
      ]);
      assert.equal(await hasAdmin(db), true);
      // The instance's only account predates roles, so it owned the instance.
      assert.equal(await roleOf(db, "u1"), "admin");
      // Legacy epoch-ms timestamps still read as dates.
      const row = await db.selectFrom("user").select("createdAt").executeTakeFirstOrThrow();
      assert.equal(new Date(row.createdAt).getTime(), 1);
    } finally {
      await db.close();
    }
  });

  test("an instance with the old single-account trigger accepts more users", async () => {
    const file = legacyFile("");
    await (await openDatabase({ dialect: "sqlite", path: file })).close();
    withRaw(file, (raw) => {
      raw.exec(`
        CREATE TRIGGER prevent_multiple_users BEFORE INSERT ON user
        WHEN (SELECT COUNT(*) FROM user) >= 1
        BEGIN SELECT RAISE(ABORT, 'Only one user account is allowed in this deployment'); END;
      `);
    });
    const db = await openDatabase({ dialect: "sqlite", path: file });
    try {
      await insertUser(db, "u1");
      await insertUser(db, "u2");
      await insertUser(db, "u3");
      assert.equal(await userCount(db), 3);
    } finally {
      await db.close();
    }
  });

  test("password accounts are marked verified once, SSO-only ones are left alone", async () => {
    const file = legacyFile("");
    const db = await openDatabase({ dialect: "sqlite", path: file });
    try {
      // An instance from before the backfill: the marker isn't there yet.
      await db.deleteFrom("app_state").where("key", "=", "credential_emails_verified").execute();
      const addAccount = (userId: string, providerId: string) =>
        db
          .insertInto("account")
          .values({ id: `${userId}-${providerId}`, userId, accountId: userId, providerId, createdAt: ISO, updatedAt: ISO })
          .execute();
      const verified = async (id: string) =>
        (await db.selectFrom("user").select("emailVerified").where("id", "=", id).executeTakeFirstOrThrow()).emailVerified;

      await insertUser(db, "owner");
      await addAccount("owner", "credential");
      await insertUser(db, "both");
      await addAccount("both", "credential");
      await addAccount("both", "google");
      await insertUser(db, "sso");
      await addAccount("sso", "google");

      await migrate(db);
      assert.equal(await verified("owner"), 1);
      assert.equal(await verified("both"), 1);
      assert.equal(await verified("sso"), 0);
      assert.equal(await kvGet(db, "credential_emails_verified"), "1");

      // It runs once: a later password account, or one unverified on purpose,
      // isn't touched by the next start.
      await insertUser(db, "later");
      await addAccount("later", "credential");
      await db.updateTable("user").set({ emailVerified: 0 }).where("id", "=", "owner").execute();
      await migrate(db);
      await migrate(db);
      assert.equal(await verified("later"), 0);
      assert.equal(await verified("owner"), 0);
      assert.equal(await verified("sso"), 0);

      // And running it again (marker cleared) only ever sets credential users.
      await kvSet(db, "credential_emails_verified", "");
      await migrate(db);
      assert.equal(await verified("owner"), 1);
      assert.equal(await verified("later"), 1);
      assert.equal(await verified("sso"), 0);
    } finally {
      await db.close();
    }
  });

  test("two connections claiming setup on one file: exactly one wins", async () => {
    const file = legacyFile("");
    const dbs = await Promise.all([1, 2, 3].map(() => openDatabase({ dialect: "sqlite", path: file })));
    try {
      const results = await Promise.all(dbs.flatMap((db) => [claimSetup(db), claimSetup(db)]));
      assert.equal(results.filter(Boolean).length, 1);
    } finally {
      for (const db of dbs) await db.close();
    }
  });
});
