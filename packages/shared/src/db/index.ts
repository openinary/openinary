import type { BetterAuthOptions } from "better-auth";
import { type Kysely, sql } from "kysely";
import path from "path";
import { fileURLToPath } from "url";

import type { Schema } from "./schema";

/**
 * # The instance's database
 *
 * Accounts and API keys, the video queue, the delivery log and the key/value
 * settings. Every table is created here, so the schema has one owner.
 *
 * ## Which database
 *
 * - No `DATABASE_URL` (the default, and every existing install): one SQLite
 *   file at `DB_PATH`, else `data/auth.db` at the repo root, exactly as
 *   before. better-sqlite3 is the driver.
 * - `DATABASE_URL=postgres://...` (or `postgresql://`): Postgres through a
 *   node-postgres pool of `DATABASE_POOL_MAX` connections (default 5; the
 *   full image runs the API and the web app, so two pools per container),
 *   for several nodes sharing one database. SSL comes from the URL's
 *   `sslmode`.
 * - Anything else in `DATABASE_URL` is a startup error.
 *
 * Each dialect module (sqlite.ts, postgres.ts) is imported lazily, so a
 * Postgres deployment never loads better-sqlite3 and vice versa.
 *
 * ## One query layer
 *
 * A {@link Database} is a `Kysely<Schema>` with `dialect`, `location` and
 * `close()` on it. Write queries with Kysely's builder, which compiles to
 * each dialect; reach for `sql` only when the builder can't say it, and then
 * stick to SQL both accept (quoted identifiers, `ON CONFLICT`, `RETURNING`,
 * `CAST(x AS BIGINT)`, `CASE WHEN` instead of summing booleans). Everything
 * is async on both dialects, SQLite included.
 *
 * What differs per dialect, and how to stay portable:
 * - Better Auth booleans are 0/1 on SQLite, boolean on Postgres. Write 0/1
 *   as a parameter (Postgres accepts '1'/'0' for a boolean), read with `!!`.
 *   Never compare a boolean column to a literal integer in raw SQL.
 * - Better Auth timestamps are ISO text on SQLite (older rows may be epoch
 *   ms), timestamptz on Postgres (read back as a Date). Write ISO strings,
 *   read with `new Date(value)`.
 * - The app's own epoch-ms columns are INTEGER on SQLite and BIGINT on
 *   Postgres. node-postgres returns BIGINT and NUMERIC as strings; our pool
 *   parses both to number (safe: epoch ms and counts stay far below 2^53),
 *   so `COUNT(*)`, `SUM(...)` and epoch columns are numbers on both.
 * - Affected-row counts: use Kysely's results (`numInsertedOrUpdatedRows`,
 *   `numUpdatedRows`, `numDeletedRows`, `numAffectedRows`), which both
 *   drivers fill in.
 * - The first-account-is-admin rule is a trigger on both (SQLite trigger,
 *   plpgsql function on Postgres serialized by an advisory lock).
 *
 * ## Migrations
 *
 * `migrate(db)` runs at open, idempotently, per dialect:
 * - SQLite (migrate-sqlite.ts): the original migrate(), every legacy upgrade
 *   step included, in one IMMEDIATE transaction.
 * - Postgres (migrate-postgres.ts): the current schema, created in one
 *   transaction holding `pg_advisory_xact_lock`, so nodes booting together
 *   don't race.
 *
 * Both record `schema_version` in app_state ({@link SCHEMA_VERSION}). To change
 * the schema: bump SCHEMA_VERSION, then add a step with that version to the
 * STEPS list of both migrate-sqlite.ts and migrate-postgres.ts (written
 * idempotently, and backwards compatible so older nodes keep running during
 * a rolling upgrade), and update schema.ts.
 *
 * ## The shared connection
 *
 * `getDatabase()` opens and migrates on first call and caches the promise,
 * so concurrent first calls share one open. A failed open isn't cached: the
 * next call tries again (Postgres may still be starting).
 */

export type { Schema } from "./schema";
export * from "./schema";
export { SCHEMA_VERSION, SCHEMA_VERSION_KEY } from "./version";
// So callers write raw SQL and name transaction types without their own kysely dependency.
export { sql } from "kysely";
export type { Insertable, Kysely, Selectable, Transaction, Updateable } from "kysely";

export type Dialect = "sqlite" | "postgres";

export interface SqliteConfig {
  dialect: "sqlite";
  /** A file path, or ":memory:". */
  path: string;
}

export interface PostgresConfig {
  dialect: "postgres";
  url: string;
  /** Pool size per process. */
  poolMax: number;
  /** A schema to use instead of the connection's default search_path (tests use one per instance). */
  schema?: string;
}

export type DatabaseConfig = SqliteConfig | PostgresConfig;

/** A Kysely instance on the instance's database, either dialect. */
export type Database = Kysely<Schema> & {
  readonly dialect: Dialect;
  /** For logs and health checks: the SQLite path, or the Postgres URL without its password. */
  readonly location: string;
  /** Closes the connection (SQLite) or ends the pool (Postgres). */
  close(): Promise<void>;
};

/** Kept so `import type { Db }` call sites keep compiling. */
export type Db = Database;

/** What a dialect module hands back to openDatabase. Internal. */
export interface DialectHandle {
  kysely: Kysely<Schema>;
  location: string;
  /** What Better Auth's `database` option gets for this dialect. */
  authDatabase: unknown;
}

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

/** process.env, or a plain object in tests. */
type Env = Record<string, string | undefined>;

/** DB_PATH, else data/auth.db at the repo root (Docker images set DB_PATH). */
export function resolveDbPath(env: Env = process.env): string {
  return env.DB_PATH || path.join(repoRoot, "data", "auth.db");
}

const DEFAULT_POOL_MAX = 5;

/**
 * The database the environment asks for. Throws on a DATABASE_URL that isn't
 * Postgres or a bad DATABASE_POOL_MAX, so a typo fails at startup instead of
 * silently falling back to a SQLite file. An empty DATABASE_URL counts as
 * unset (compose files often pass `DATABASE_URL=`).
 */
export function resolveDatabaseConfig(env: Env = process.env): DatabaseConfig {
  const url = env.DATABASE_URL?.trim();
  if (!url) return { dialect: "sqlite", path: resolveDbPath(env) };

  if (!/^postgres(ql)?:\/\//i.test(url)) {
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1];
    throw new Error(
      `DATABASE_URL must be a Postgres URL (postgres://... or postgresql://...), got ${
        scheme ? `a "${scheme}:" URL` : "something else"
      }.\nUnset DATABASE_URL to use the built-in SQLite database at DB_PATH.`,
    );
  }

  let poolMax = DEFAULT_POOL_MAX;
  const rawPoolMax = env.DATABASE_POOL_MAX?.trim();
  if (rawPoolMax) {
    poolMax = Number(rawPoolMax);
    if (!Number.isInteger(poolMax) || poolMax < 1) {
      throw new Error(`DATABASE_POOL_MAX must be a positive integer, got "${rawPoolMax}".`);
    }
  }
  return { dialect: "postgres", url, poolMax };
}

const SCHEMA_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

const authDatabases = new WeakMap<Kysely<Schema>, unknown>();

/**
 * Opens the database and migrates it. Each call is a new connection (or
 * pool): use {@link getDatabase} in app code, this in tests and scripts.
 */
export async function openDatabase(config: DatabaseConfig = resolveDatabaseConfig()): Promise<Database> {
  let handle: DialectHandle;
  if (config.dialect === "sqlite") {
    const { openSqlite } = await import("./sqlite.js");
    handle = openSqlite(config.path);
  } else {
    if (config.schema !== undefined && !SCHEMA_NAME.test(config.schema)) {
      throw new Error(`Invalid Postgres schema name "${config.schema}".`);
    }
    const { openPostgres } = await import("./postgres.js");
    handle = openPostgres(config);
  }
  const { kysely } = handle;
  const db = Object.assign(kysely, {
    dialect: config.dialect,
    location: handle.location,
    close: () => kysely.destroy(),
  }) as Database;
  authDatabases.set(kysely, handle.authDatabase);
  try {
    await migrate(db);
  } catch (error) {
    await db.close().catch(() => {});
    throw error;
  }
  return db;
}

/** Brings the schema up to date. Idempotent; openDatabase already ran it. */
export async function migrate(db: Database): Promise<void> {
  if (db.dialect === "sqlite") {
    const { migrateSqlite } = await import("./sqlite.js");
    migrateSqlite(db);
  } else {
    const { migratePostgres } = await import("./migrate-postgres.js");
    await migratePostgres(db);
  }
}

/** What Better Auth's `database` option gets for this database. Used by auth.ts. */
export function betterAuthDatabase(db: Database): BetterAuthOptions["database"] {
  const value = authDatabases.get(db);
  if (value === undefined) throw new Error("betterAuthDatabase: not a database opened by openDatabase");
  return value as BetterAuthOptions["database"];
}

let shared: Promise<Database> | undefined;

/**
 * The process-wide database from the environment, opened and migrated on
 * first use. Concurrent first calls share one open; a failed open is retried
 * by the next call.
 */
export function getDatabase(): Promise<Database> {
  shared ??= openDatabase().catch((error: unknown) => {
    shared = undefined;
    throw error;
  });
  return shared;
}

/** Closes the process-wide database (shutdown, tests). The next getDatabase() opens a new one. */
export async function closeDatabase(): Promise<void> {
  const current = shared;
  shared = undefined;
  if (current) await (await current.catch(() => undefined))?.close();
}

/**
 * True once setup is done, that is once any account exists (the first one is
 * always made admin). Kept under this name for the routes that already call it.
 */
export async function hasAdmin(db?: Database): Promise<boolean> {
  db ??= await getDatabase();
  return !!(await db.selectFrom("user").select("id").limit(1).executeTakeFirst());
}

const SETUP_CLAIM = "setup_claim";
const SETUP_CLAIM_TTL_MS = 60_000;

/**
 * Reserves the one password account setup may create, in a single statement
 * so it holds across concurrent requests, processes and nodes: of N sign-ups
 * racing on an empty instance, exactly one gets true. False once any account
 * exists. A claim whose sign-up failed frees itself after a minute.
 */
export async function claimSetup(db?: Database, now = Date.now()): Promise<boolean> {
  db ??= await getDatabase();
  const result = await sql`
    INSERT INTO app_state (key, value)
    SELECT CAST(${SETUP_CLAIM} AS TEXT), CAST(${String(now)} AS TEXT)
    WHERE NOT EXISTS (SELECT 1 FROM "user")
    ON CONFLICT (key) DO UPDATE SET value = excluded.value
    WHERE CAST(app_state.value AS BIGINT) < ${now - SETUP_CLAIM_TTL_MS}
  `.execute(db);
  return Number(result.numAffectedRows) === 1;
}

export interface UserAccess {
  id: string;
  email: string;
  name: string;
  role: string | null;
  banned: boolean;
}

/** The user columns {@link userAccessFrom} reads, as either dialect (or Better Auth) returns them. */
export interface UserAccessRow {
  id: string;
  email: string;
  name: string;
  role?: string | null;
  banned?: number | boolean | null;
  banExpires?: Date | string | number | null;
}

/** A user row as the permission check sees it: a ban with an expiry ends on its own, like Better Auth's own check. */
export function userAccessFrom(row: UserAccessRow, now = Date.now()): UserAccess {
  const banEnded = row.banExpires != null && new Date(row.banExpires).getTime() < now;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role ?? null,
    banned: !!row.banned && !banEnded,
  };
}

/** The fields every request's permission check needs, read fresh from the database. */
export async function getUserAccess(userId: string, db?: Database): Promise<UserAccess | undefined> {
  db ??= await getDatabase();
  const row = await db
    .selectFrom("user")
    .select(["id", "email", "name", "role", "banned", "banExpires"])
    .where("id", "=", userId)
    .executeTakeFirst();
  return row && userAccessFrom(row);
}

export async function kvGet(db: Database, key: string): Promise<string | undefined> {
  const row = await db.selectFrom("app_state").select("value").where("key", "=", key).executeTakeFirst();
  return row?.value;
}

export async function kvSet(db: Database, key: string, value: string): Promise<void> {
  await db
    .insertInto("app_state")
    .values({ key, value })
    .onConflict((oc) => oc.column("key").doUpdateSet({ value }))
    .execute();
}

/** Stores `value` unless `key` already has one, and returns what is stored. */
export async function kvInit(db: Database, key: string, value: string): Promise<string> {
  await db
    .insertInto("app_state")
    .values({ key, value })
    .onConflict((oc) => oc.column("key").doNothing())
    .execute();
  return (await kvGet(db, key)) ?? value;
}
