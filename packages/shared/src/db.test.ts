import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";

import { hasAdmin, kvGet, migrate } from "./db";

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
  assert.throws(() =>
    db.exec("INSERT INTO user (id, email, name, createdAt, updatedAt) VALUES ('u2', 'x@y.z', 'X', 1, 1)"),
  );
});
