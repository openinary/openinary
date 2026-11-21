import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";

import { getUserAccess, hasAdmin, kvGet, kvSet, migrate } from "./db";

const insertUser = (db: Database.Database, id: string, email = `${id}@example.com`) =>
  db
    .prepare("INSERT INTO user (id, email, name, createdAt, updatedAt) VALUES (?, ?, ?, 1, 1)")
    .run(id, email, id);

const roleOf = (db: Database.Database, id: string) =>
  (db.prepare("SELECT role FROM user WHERE id = ?").get(id) as { role: string | null }).role;

test("an older volume keeps its settings and API keys", () => {
  const db = new Database(":memory:");
  db.exec(`
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

  migrate(db);
  migrate(db);

  assert.equal(kvGet(db, "secret_hash"), "abc");
  assert.equal(kvGet(db, "instance_id"), "id-1");
  assert.equal(kvGet(db, "workspace"), '{"name":"Acme"}');
  assert.deepEqual(db.prepare("SELECT id, referenceId FROM apiKey").all(), [
    { id: "k1", referenceId: "u1" },
  ]);
  assert.equal(hasAdmin(db), true);
  // The instance's only account predates roles, so it owned the instance.
  assert.equal(roleOf(db, "u1"), "admin");
});

test("an instance with the old single-account trigger accepts more users", () => {
  const db = new Database(":memory:");
  migrate(db);
  db.exec(`
    CREATE TRIGGER prevent_multiple_users BEFORE INSERT ON user
    WHEN (SELECT COUNT(*) FROM user) >= 1
    BEGIN SELECT RAISE(ABORT, 'Only one user account is allowed in this deployment'); END;
  `);
  insertUser(db, "u1");
  migrate(db);
  insertUser(db, "u2");
  insertUser(db, "u3");
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM user").get() as { n: number }).n, 3);
});

test("on a fresh instance only the first account becomes admin", () => {
  const db = new Database(":memory:");
  migrate(db);
  insertUser(db, "first");
  db.prepare("INSERT INTO user (id, email, name, createdAt, updatedAt, role) VALUES ('second', 's@x.y', 'S', 1, 1, 'viewer')").run();
  insertUser(db, "third");
  assert.equal(roleOf(db, "first"), "admin");
  assert.equal(roleOf(db, "second"), "viewer");
  assert.equal(roleOf(db, "third"), null);

  // Re-running never re-promotes anyone or touches roles.
  migrate(db);
  migrate(db);
  assert.equal(roleOf(db, "second"), "viewer");
  assert.equal(roleOf(db, "third"), null);
});

test("getUserAccess reads role and ban, and an expired ban no longer counts", () => {
  const db = new Database(":memory:");
  migrate(db);
  insertUser(db, "a");
  insertUser(db, "b");
  insertUser(db, "c");
  insertUser(db, "d");
  const ban = db.prepare("UPDATE user SET role = 'member', banned = 1, banExpires = ? WHERE id = ?");
  ban.run(null, "b");
  ban.run(Date.now() - 1000, "c");
  ban.run(Date.now() + 60_000, "d");

  assert.deepEqual(getUserAccess("a", db), {
    id: "a",
    email: "a@example.com",
    name: "a",
    role: "admin",
    banned: false,
  });
  assert.equal(getUserAccess("b", db)?.banned, true);
  assert.equal(getUserAccess("c", db)?.banned, false);
  assert.equal(getUserAccess("d", db)?.banned, true);
  assert.equal(getUserAccess("b", db)?.role, "member");
  assert.equal(getUserAccess("missing", db), undefined);
});

test("password accounts are marked verified once, SSO-only ones are left alone", () => {
  const db = new Database(":memory:");
  migrate(db);
  // An instance from before the backfill: the marker isn't there yet.
  db.prepare("DELETE FROM app_state WHERE key = 'credential_emails_verified'").run();
  const addAccount = (userId: string, providerId: string) =>
    db
      .prepare(
        "INSERT INTO account (id, userId, accountId, providerId, createdAt, updatedAt) VALUES (?, ?, ?, ?, 1, 1)",
      )
      .run(`${userId}-${providerId}`, userId, userId, providerId);
  const verified = (id: string) =>
    (db.prepare("SELECT emailVerified FROM user WHERE id = ?").get(id) as { emailVerified: number }).emailVerified;

  insertUser(db, "owner");
  addAccount("owner", "credential");
  insertUser(db, "both");
  addAccount("both", "credential");
  addAccount("both", "google");
  insertUser(db, "sso");
  addAccount("sso", "google");

  migrate(db);
  assert.equal(verified("owner"), 1);
  assert.equal(verified("both"), 1);
  assert.equal(verified("sso"), 0);
  assert.equal(kvGet(db, "credential_emails_verified"), "1");

  // It runs once: a later password account, or one unverified on purpose,
  // isn't touched by the next start.
  insertUser(db, "later");
  addAccount("later", "credential");
  db.prepare("UPDATE user SET emailVerified = 0 WHERE id = 'owner'").run();
  migrate(db);
  migrate(db);
  assert.equal(verified("later"), 0);
  assert.equal(verified("owner"), 0);
  assert.equal(verified("sso"), 0);

  // And running it again (marker cleared) only ever sets credential users.
  kvSet(db, "credential_emails_verified", "");
  migrate(db);
  assert.equal(verified("owner"), 1);
  assert.equal(verified("later"), 1);
  assert.equal(verified("sso"), 0);
});
