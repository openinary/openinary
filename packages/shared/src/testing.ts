import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after } from "node:test";

import { closeDatabase, type Database, type Dialect, openDatabase } from "./db";

/**
 * Test databases on every dialect, for running one suite against both:
 *
 * ```ts
 * import { describe, test } from "node:test";
 * import { testDialects } from "shared/testing";
 *
 * for (const dialect of testDialects()) {
 *   describe(dialect.name, { skip: dialect.skip }, () => {
 *     test("...", async () => {
 *       const db = await dialect.open();
 *       // ... the helper closes and removes it when the file's tests end
 *     });
 *   });
 * }
 * ```
 *
 * SQLite runs everywhere, each database a temp file. Postgres runs when
 * TEST_DATABASE_URL is set (e.g. postgres://postgres@localhost:55432/postgres
 * against a throwaway container), each database a fresh schema with a random
 * name that is dropped afterwards, so files can run in parallel on one server.
 */
export interface TestDialect {
  name: Dialect;
  /** Why this dialect's tests are skipped, or undefined when they run. Pass to describe/test's `skip`. */
  skip: string | undefined;
  /** A fresh, migrated, empty database. Closed and removed once the test file is done. */
  open(): Promise<Database>;
}

const cleanups: (() => Promise<void>)[] = [];

// Registered when a test file imports this module, i.e. at its top level, so
// it runs once after all of that file's tests (inside a test it would run
// after that test only).
after(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup().catch(() => {});
});

async function registerCleanup(fn: () => Promise<void>) {
  cleanups.push(fn);
}

export async function openSqliteTestDatabase(): Promise<Database> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openinary-db-"));
  const db = await openDatabase({ dialect: "sqlite", path: path.join(dir, "auth.db") });
  await registerCleanup(async () => {
    await db.close().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return db;
}

/** The test server's URL, or undefined when Postgres tests should skip. */
export function testDatabaseUrl(): string | undefined {
  return process.env.TEST_DATABASE_URL?.trim() || undefined;
}

/**
 * Creates an empty schema on the test server and returns its name, dropping
 * it (and everything in it) when the file's tests end. Opening it is up to
 * the caller, so tests can open several databases on one schema.
 */
export async function createTestSchema(): Promise<string> {
  const url = testDatabaseUrl();
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  const { default: pg } = await import("pg");
  const schema = `openinary_test_${randomUUID().replace(/-/g, "")}`;
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
  } finally {
    await admin.end();
  }
  await registerCleanup(async () => {
    const dropper = new pg.Client({ connectionString: url });
    await dropper.connect();
    try {
      await dropper.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await dropper.end();
    }
  });
  return schema;
}

/** Opens (and migrates) a database on `schema` of the test server, closed when the file's tests end. */
export async function openPostgresTestDatabase(schema?: string): Promise<Database> {
  const url = testDatabaseUrl();
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  schema ??= await createTestSchema();
  const db = await openDatabase({ dialect: "postgres", url, poolMax: 5, schema });
  // Registered after the schema's drop, so it runs (in reverse) before it.
  await registerCleanup(() => db.close());
  return db;
}

/**
 * `count` separate connections (SQLite) or pools (Postgres) to one fresh
 * database, as several processes or nodes sharing it would have. Closed and
 * removed when the file's tests end.
 */
export async function openTestDatabases(dialect: Dialect, count: number): Promise<Database[]> {
  const dbs: Database[] = [];
  if (dialect === "sqlite") {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openinary-db-"));
    await registerCleanup(async () => fs.rmSync(dir, { recursive: true, force: true }));
    for (let i = 0; i < count; i++) {
      const db = await openDatabase({ dialect: "sqlite", path: path.join(dir, "auth.db") });
      await registerCleanup(() => db.close());
      dbs.push(db);
    }
  } else {
    const schema = await createTestSchema();
    for (let i = 0; i < count; i++) dbs.push(await openPostgresTestDatabase(schema));
  }
  return dbs;
}

export function testDialects(): TestDialect[] {
  return [
    { name: "sqlite", skip: undefined, open: openSqliteTestDatabase },
    {
      name: "postgres",
      skip: testDatabaseUrl()
        ? undefined
        : "TEST_DATABASE_URL is not set (e.g. postgres://postgres@localhost:55432/postgres); skipping Postgres",
      open: () => openPostgresTestDatabase(),
    },
  ];
}

/**
 * Points the process-wide database (shared's getDatabase, which app modules
 * use) at a fresh test database of `dialect`, by setting DB_PATH or
 * DATABASE_URL. Call it before anything opens that database, typically at the
 * top of a test file that imports the app afterwards. The database is closed
 * and removed when the file's tests end.
 *
 * Since that database is one per process, a file can only target one
 * dialect; suites that run on both put the tests in a module and import it
 * from one small file per dialect.
 */
export async function useTestDatabase(dialect: Dialect): Promise<void> {
  if (dialect === "sqlite") {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openinary-db-"));
    delete process.env.DATABASE_URL;
    process.env.DB_PATH = path.join(dir, "auth.db");
    await registerCleanup(async () => {
      await closeDatabase().catch(() => {});
      fs.rmSync(dir, { recursive: true, force: true });
    });
    return;
  }
  const url = testDatabaseUrl();
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  const schema = await createTestSchema();
  // node-postgres reads libpq's `options` from the URL: every connection of
  // the app's pool starts on the test schema.
  const withSchema = new URL(url);
  withSchema.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = withSchema.toString();
  // Registered after the schema's drop, so it runs (in reverse) before it.
  await registerCleanup(() => closeDatabase());
}
