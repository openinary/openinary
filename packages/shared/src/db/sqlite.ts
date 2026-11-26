import BetterSqlite3 from "better-sqlite3";
import fs from "fs";
import { Kysely, SqliteDialect } from "kysely";
import path from "path";

import type { DialectHandle } from "./index";
import { migrateSqliteHandle } from "./migrate-sqlite";
import type { Schema } from "./schema";

/**
 * The SQLite dialect: one better-sqlite3 connection, wrapped in one Kysely
 * instance for the shared async API (Better Auth's included). The only module (with migrate-sqlite.ts) that loads
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
    // Better Auth shares this Kysely instance, not just the connection. Two
    // Kysely instances over one better-sqlite3 handle each have their own
    // mutex, so an async transaction of ours (the delivery log, the video
    // queue) and one of Better Auth's (a sign-up) would interleave on the
    // one connection: "cannot start a transaction within a transaction",
    // or one's statements landing in (and rolled back with) the other's.
    // With one instance, Kysely's single-connection mutex runs every
    // transaction alone, and a statement from outside it waits for it.
    // (Before the database layer went async ours were synchronous, so this
    // could not happen; Better Auth then got the raw handle, which it wraps
    // in its own Kysely exactly like this, transactions on.)
    //
    // The catch: code running inside one of Better Auth's transactions must
    // not query `db` directly, or it waits on the mutex its own transaction
    // holds. auth.ts's database hooks read through Better Auth's
    // transaction-bound adapter (getCurrentAdapter), its after-hooks run once
    // the transaction has committed, and its request middleware (claimSetup)
    // runs before the endpoint opens one. Postgres shares our Kysely the
    // same way, over a pool.
    authDatabase: { db: kysely, type: "sqlite", transaction: true },
  };
}

/** Runs the SQLite migration (synchronous, IMMEDIATE transaction). */
export function migrateSqlite(kysely: Kysely<Schema>): void {
  const raw = handles.get(kysely);
  if (!raw) throw new Error("migrateSqlite: not a database opened by openSqlite");
  migrateSqliteHandle(raw);
}
