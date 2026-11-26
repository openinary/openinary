import BetterSqlite3 from "better-sqlite3";
import fs from "fs";
import { Kysely, SqliteDialect } from "kysely";
import path from "path";

import type { DialectHandle } from "./index";
import { migrateSqliteHandle } from "./migrate-sqlite";
import type { Schema } from "./schema";

/**
 * The SQLite dialect: one better-sqlite3 connection, wrapped in Kysely for
 * the shared async API. The only module (with migrate-sqlite.ts) that loads
 * better-sqlite3; index.ts imports it lazily, so a Postgres deployment never
 * loads the native module or touches the file.
 */

const handles = new WeakMap<Kysely<Schema>, BetterSqlite3.Database>();

/** Opens (creating the file and its folder if needed). Pass ":memory:" in tests. */
export function openSqlite(file: string): DialectHandle {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const raw = new BetterSqlite3(file);
  const kysely = new Kysely<Schema>({ dialect: new SqliteDialect({ database: raw }) });
  handles.set(kysely, raw);
  return {
    kysely,
    location: file,
    // Better Auth gets the raw connection, exactly as before Postgres support:
    // it builds its own Kysely over it (with transactions on). Its own mutex
    // keeps it from deadlocking against ours, and statements from either run
    // on the same connection, so the auth hooks see Better Auth's open
    // transaction just as they did with synchronous better-sqlite3 calls.
    authDatabase: raw,
  };
}

/** Runs the SQLite migration (synchronous, IMMEDIATE transaction). */
export function migrateSqlite(kysely: Kysely<Schema>): void {
  const raw = handles.get(kysely);
  if (!raw) throw new Error("migrateSqlite: not a database opened by openSqlite");
  migrateSqliteHandle(raw);
}
