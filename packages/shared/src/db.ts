import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * The self-hosted instance's single SQLite file: accounts and API keys, the
 * video queue, the delivery log, and the key/value settings. Every table is
 * created here, so the schema has one owner and one place to read.
 */
export type Db = Database.Database;

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

/** DB_PATH, else data/auth.db at the repo root (Docker images set DB_PATH). */
export function resolveDbPath(): string {
  return process.env.DB_PATH || path.join(repoRoot, "data", "auth.db");
}

/** Opens (creating if needed) and migrates. Pass ":memory:" in tests. */
export function openDb(file = resolveDbPath()): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  migrate(db);
  return db;
}

let shared: Db | undefined;

/** The process-wide connection, opened on first use. */
export function getDb(): Db {
  return (shared ??= openDb());
}

const API_KEY_COLUMNS = `
  id TEXT PRIMARY KEY,
  name TEXT,
  start TEXT,
  prefix TEXT,
  key TEXT NOT NULL,
  referenceId TEXT NOT NULL,
  configId TEXT NOT NULL DEFAULT 'default',
  refillInterval INTEGER,
  refillAmount INTEGER,
  lastRefillAt INTEGER,
  enabled INTEGER NOT NULL DEFAULT 1,
  rateLimitEnabled INTEGER NOT NULL DEFAULT 1,
  rateLimitTimeWindow INTEGER,
  rateLimitMax INTEGER,
  requestCount INTEGER NOT NULL DEFAULT 0,
  remaining INTEGER,
  lastRequest INTEGER,
  expiresAt INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  permissions TEXT,
  metadata TEXT,
  FOREIGN KEY (referenceId) REFERENCES user(id) ON DELETE CASCADE`;

const HOUR_MS = 3_600_000;

const tableExists = (db: Db, name: string) =>
  !!db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);

/**
 * Idempotent: safe on a fresh file and on every volume an older release left
 * behind. IMMEDIATE because the API and the dashboard open the same file at
 * the same time in the full image.
 */
export function migrate(db: Db): void {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS user (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        emailVerified INTEGER NOT NULL DEFAULT 0,
        name TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        image TEXT,
        twoFactorEnabled INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS session (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        expiresAt INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        ipAddress TEXT,
        userAgent TEXT,
        FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS account (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        accountId TEXT NOT NULL,
        providerId TEXT NOT NULL,
        accessToken TEXT,
        refreshToken TEXT,
        idToken TEXT,
        accessTokenExpiresAt INTEGER,
        refreshTokenExpiresAt INTEGER,
        scope TEXT,
        password TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS verification (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        value TEXT NOT NULL,
        expiresAt INTEGER NOT NULL,
        createdAt INTEGER,
        updatedAt INTEGER
      );
      CREATE TABLE IF NOT EXISTS apiKey (${API_KEY_COLUMNS});

      -- Instances used to allow a single account. Who may join is now the
      -- sign-in policy's job (see auth-config.ts), and what they may do is
      -- their role's.
      DROP TRIGGER IF EXISTS prevent_multiple_users;

      CREATE TABLE IF NOT EXISTS video_jobs (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        params_json TEXT NOT NULL,
        cache_path TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'processing', 'completed', 'error', 'cancelled')),
        priority INTEGER NOT NULL DEFAULT 2,
        progress INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 3,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_video_jobs_status_priority ON video_jobs(status, priority, created_at);
      CREATE INDEX IF NOT EXISTS idx_video_jobs_file_params ON video_jobs(file_path, params_json);

      CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS delivery_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        t INTEGER NOT NULL,
        path TEXT NOT NULL,
        kind TEXT NOT NULL,
        status INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS delivery_counts (
        hour INTEGER NOT NULL,
        kind TEXT NOT NULL,
        delivered INTEGER NOT NULL,
        failed INTEGER NOT NULL,
        PRIMARY KEY (hour, kind)
      );
    `);

    // @better-auth/api-key 1.5 renamed userId to referenceId.
    const hasReferenceId = db
      .prepare(
        "SELECT 1 FROM pragma_table_info('apiKey') WHERE name = 'referenceId'",
      )
      .get();
    if (!hasReferenceId) {
      db.exec(`
        CREATE TABLE apiKey_new (${API_KEY_COLUMNS});
        INSERT INTO apiKey_new SELECT
          id, name, start, prefix, key,
          userId, 'default',
          refillInterval, refillAmount, lastRefillAt,
          enabled, rateLimitEnabled, rateLimitTimeWindow, rateLimitMax,
          requestCount, remaining, lastRequest, expiresAt,
          createdAt, updatedAt, permissions, metadata
        FROM apiKey;
        DROP TABLE apiKey;
        ALTER TABLE apiKey_new RENAME TO apiKey;
      `);
    }

    // Better Auth's admin plugin: roles and bans. Every account that existed
    // before roles was its instance's only one, so it was the admin.
    const hasColumn = (table: string, column: string) =>
      !!db
        .prepare("SELECT 1 FROM pragma_table_info(?) WHERE name = ?")
        .get(table, column);
    if (!hasColumn("user", "role")) {
      db.exec(`
        ALTER TABLE user ADD COLUMN role TEXT;
        UPDATE user SET role = 'admin';
      `);
    }
    if (!hasColumn("user", "banned")) db.exec("ALTER TABLE user ADD COLUMN banned INTEGER DEFAULT 0");
    if (!hasColumn("user", "banReason")) db.exec("ALTER TABLE user ADD COLUMN banReason TEXT");
    if (!hasColumn("user", "banExpires")) db.exec("ALTER TABLE user ADD COLUMN banExpires INTEGER");
    if (!hasColumn("session", "impersonatedBy")) {
      db.exec("ALTER TABLE session ADD COLUMN impersonatedBy TEXT");
    }

    // The first account is the admin, however it was created (/setup,
    // OPENINARY_ADMIN_*, or a first SSO sign-in). Done in the database since
    // SQLite runs one write at a time, so of two sign-ups racing
    // on an empty instance exactly one sees a count of 1.
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS first_user_is_admin
      AFTER INSERT ON user
      WHEN (SELECT COUNT(*) FROM user) = 1
      BEGIN
        UPDATE user SET role = 'admin' WHERE id = NEW.id;
      END;
    `);

    // Older releases kept settings in two more key/value tables. Their
    // keys never overlap app_state's, so the rows move over unchanged.
    for (const legacy of ["_auth_config", "_telemetry_config"]) {
      if (!tableExists(db, legacy)) continue;
      db.exec(`
        INSERT OR IGNORE INTO app_state (key, value) SELECT key, value FROM ${legacy};
        DROP TABLE ${legacy};
      `);
    }

    // An instance upgrading to counts starts them from the lines it already
    // holds, so its chart doesn't open empty.
    if (!db.prepare("SELECT 1 FROM delivery_counts LIMIT 1").get()) {
      db.exec(`
        INSERT INTO delivery_counts (hour, kind, delivered, failed)
        SELECT (t / ${HOUR_MS}) * ${HOUR_MS}, kind,
               SUM(status < 400), SUM(status >= 400)
        FROM delivery_log GROUP BY 1, 2
      `);
    }
  }).immediate();
}

/**
 * True once setup is done, that is once any account exists (the first one is
 * always made admin). Kept under this name for the routes that already call it.
 */
export function hasAdmin(db: Db = getDb()): boolean {
  return !!db.prepare("SELECT 1 FROM user LIMIT 1").get();
}

export interface UserAccess {
  id: string;
  email: string;
  name: string;
  role: string | null;
  banned: boolean;
}

/** The fields every request's permission check needs, read fresh from the database. */
export function getUserAccess(userId: string, db: Db = getDb()): UserAccess | undefined {
  const row = db
    .prepare("SELECT id, email, name, role, banned, banExpires FROM user WHERE id = ?")
    .get(userId) as
    | (Omit<UserAccess, "banned"> & { banned: number | null; banExpires: number | string | null })
    | undefined;
  if (!row) return undefined;
  // A ban with an expiry ends on its own, like Better Auth's own check.
  const banEnded = row.banExpires != null && new Date(row.banExpires).getTime() < Date.now();
  return { id: row.id, email: row.email, name: row.name, role: row.role, banned: !!row.banned && !banEnded };
}

export function kvGet(db: Db, key: string): string | undefined {
  const row = db.prepare("SELECT value FROM app_state WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function kvSet(db: Db, key: string, value: string): void {
  db.prepare(
    "INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

/** Stores `value` unless `key` already has one, and returns what is stored. */
export function kvInit(db: Db, key: string, value: string): string {
  db.prepare("INSERT OR IGNORE INTO app_state (key, value) VALUES (?, ?)").run(
    key,
    value,
  );
  return kvGet(db, key) ?? value;
}
