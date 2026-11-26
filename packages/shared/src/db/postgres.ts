import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";

import type { DialectHandle, PostgresConfig } from "./index";
import type { Schema } from "./schema";

/**
 * The Postgres dialect: a node-postgres pool wrapped in Kysely. Loaded lazily
 * by index.ts, only when DATABASE_URL points at Postgres.
 */

const INT8_OID = 20;
const NUMERIC_OID = 1700;

/**
 * node-postgres returns BIGINT (and COUNT(*)) and NUMERIC (SUM/AVG of
 * integers) as strings, since they can exceed 2^53. Everything this app
 * stores in them is epoch ms or a count, far below that, and SQLite returns
 * plain numbers, so this pool parses both to number. Scoped to the pool, not
 * set on pg's global type table, so other pg users in the process (none
 * today) keep the defaults.
 */
const types = {
  getTypeParser: ((oid: number, format?: "text" | "binary") => {
    if (format !== "binary" && (oid === INT8_OID || oid === NUMERIC_OID)) {
      return (value: string) => (value === null ? null : Number(value));
    }
    return pg.types.getTypeParser(oid, format as "text");
  }) as typeof pg.types.getTypeParser,
};

/**
 * Query parameters that may carry a secret. pg-connection-string copies
 * every parameter into the client config, so `?password=` works as well as
 * the userinfo one; `sslpassword` (libpq's, for an encrypted key) and any
 * other pass/secret/token-like name are hidden too. `sslkey`, `sslcert` and
 * `sslrootcert` are file paths, not secrets, and stay readable.
 */
const SECRET_PARAM = /pass|secret|token/i;

/** The secret values in a Postgres URL (userinfo password, secret-looking parameters). */
export function urlSecrets(url: string): string[] {
  try {
    const parsed = new URL(url);
    const secrets = parsed.password ? [decodeURIComponent(parsed.password)] : [];
    for (const [name, value] of parsed.searchParams) {
      if (SECRET_PARAM.test(name) && value) secrets.push(value);
    }
    return secrets;
  } catch {
    return [];
  }
}

/** "postgres://user:secret@host/db?password=..." without the secrets, for logs. */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "***";
    for (const name of new Set(parsed.searchParams.keys())) {
      if (SECRET_PARAM.test(name)) parsed.searchParams.set(name, "***");
    }
    return parsed.toString();
  } catch {
    return "postgres://(unparseable URL)";
  }
}

export function openPostgres(config: PostgresConfig): DialectHandle {
  const pool = new pg.Pool({
    // SSL comes from the URL: ?sslmode=verify-full (or require, which pg 8
    // treats the same and warns about), ?sslmode=no-verify, ?sslmode=disable.
    connectionString: config.url,
    max: config.poolMax,
    types,
    // A schema other than the user's default (tests use one per instance).
    ...(config.schema && { options: `-c search_path=${config.schema}` }),
  });
  // An idle client losing its connection (a failover, a restart) emits this;
  // unhandled it would crash the process. The pool replaces the client.
  pool.on("error", (error) => console.error("Postgres connection error:", error.message));
  const kysely = new Kysely<Schema>({ dialect: new PostgresDialect({ pool }) });
  return {
    kysely,
    location: redactUrl(config.url) + (config.schema ? ` (schema ${config.schema})` : ""),
    // Better Auth shares our pool through our Kysely instance. Its database
    // hooks read through Better Auth's own transaction-bound adapter (see
    // auth.ts), so a hook never waits on a second pool connection while its
    // transaction holds the first.
    authDatabase: { db: kysely, type: "postgres", transaction: true },
  };
}
