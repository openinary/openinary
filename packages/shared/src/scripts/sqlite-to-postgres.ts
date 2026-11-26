/**
 * # Copy a SQLite instance into Postgres
 *
 * For moving an existing install (the default SQLite file) to the opt-in
 * Postgres database, once, before setting DATABASE_URL:
 *
 * ```sh
 * # from a checkout
 * pnpm --filter shared db:copy-to-postgres -- --from data/auth.db --to "$DATABASE_URL" --dry-run
 * # inside the Docker image (app stopped)
 * docker compose run --rm --no-deps openinary \
 *   node /app/packages/shared/dist/scripts/sqlite-to-postgres.js --to "$DATABASE_URL" --dry-run
 * ```
 *
 * `--from` defaults to DB_PATH (else data/auth.db), `--to` to DATABASE_URL.
 *
 * ## What it does
 *
 * 1. Never writes the source. The file is opened read-only and snapshotted
 *    with `VACUUM INTO` to a temp file; the SQLite migrate() runs on that
 *    copy, so a volume from an older release (apiKey.userId, no roles...) is
 *    read at the current schema. The temp file is deleted at the end.
 * 2. Opens the target with openDatabase(), which creates the Postgres schema
 *    if it isn't there yet (what the app's first boot would do).
 * 3. Refuses a target that already holds data (any row in the app's tables,
 *    or app_state keys beyond the schema markers), unless `--truncate`: that
 *    empties the target's tables first, inside the copy's transaction.
 * 4. Copies every table in one transaction, users first, in batches,
 *    converting Better Auth's SQLite booleans (0/1) and timestamps (ISO text
 *    or epoch ms) to boolean and timestamptz. The first-user-is-admin trigger
 *    is disabled for the copy so roles arrive exactly as they were.
 *    Sessions, accounts and API keys whose user no longer exists (SQLite
 *    never enforced the foreign keys) are skipped and reported.
 * 5. Counts every table again before committing; any difference rolls the
 *    whole copy back and exits non-zero.
 *
 * `--dry-run` does all of the above, then rolls the transaction back: it
 * proves the data fits the Postgres schema without keeping a row (the empty
 * schema from step 2 stays, as it would after the app's first boot).
 *
 * The copy carries `secret_hash`, so the Postgres instance must run with the
 * same BETTER_AUTH_SECRET as the SQLite one (it refuses to start otherwise,
 * as SQLite does). `setup_claim` and `schema_version` are not copied.
 */
import BetterSqlite3 from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { type Database, openDatabase, resolveDbPath, sql, type Transaction } from "../db/index.js";
import { migrateSqliteHandle } from "../db/migrate-sqlite.js";
import { redactUrl } from "../db/postgres.js";
import type { Schema } from "../db/schema.js";
import { SCHEMA_VERSION_KEY } from "../db/version.js";

type TableName = keyof Schema;

/** Copy order: parents before children. */
export const TABLES: TableName[] = [
  "user",
  "session",
  "account",
  "verification",
  "apiKey",
  "video_jobs",
  "app_state",
  "delivery_log",
  "delivery_counts",
];

/** Child tables whose rows need their user, by the column naming it. */
const USER_REF: Partial<Record<TableName, string>> = {
  session: "userId",
  account: "userId",
  apiKey: "referenceId",
};

/** app_state keys the target owns: never copied, never count as data. */
const SKIPPED_KEYS = new Set([SCHEMA_VERSION_KEY, "setup_claim"]);
/** app_state keys a freshly migrated target already holds. */
const MARKER_KEYS = new Set([SCHEMA_VERSION_KEY, "credential_emails_verified", "setup_claim"]);

/** SQLite columns the Postgres schema dropped on purpose. */
const DROPPED_COLUMNS: Record<string, string> = {
  "user.twoFactorEnabled": "legacy, no longer used",
};

const MAX_PARAMS = 60_000; // Postgres allows 65535 bind parameters per statement

export interface CopyOptions {
  /** The SQLite file. */
  from: string;
  /** postgres://... */
  to: string;
  /** A Postgres schema instead of the URL's default search_path. */
  schema?: string;
  dryRun?: boolean;
  truncate?: boolean;
  /** Rows per INSERT (capped so a statement stays under Postgres's parameter limit). */
  batchSize?: number;
  /** Progress output; console.log by default. */
  log?: (line: string) => void;
}

export interface TableReport {
  table: TableName;
  /** Rows in the source (app_state: keys, minus the skipped ones). */
  source: number;
  skipped: number;
  copied: number;
  /** Rows in the target after the copy (dry run: before the rollback). */
  target: number;
}

export interface CopyReport {
  tables: TableReport[];
  dryRun: boolean;
  /** Notes worth showing: dropped columns, rounded values... */
  notes: string[];
  ok: boolean;
}

/** Thrown for a refused or failed copy, with a message meant for the operator. */
export class CopyError extends Error {}

interface Column {
  name: string;
  /** information_schema data_type */
  type: string;
  nullable: boolean;
}

type Row = Record<string, unknown>;

// ---------------------------------------------------------------- conversions

const SQLITE_DATETIME = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

/** Better Auth timestamp on SQLite (ISO text, epoch ms, SQLite datetime) to a Date. */
export function toDate(value: unknown): Date | null | undefined {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  let date: Date;
  if (typeof value === "number" || typeof value === "bigint") {
    date = new Date(Number(value));
  } else if (typeof value === "string") {
    const text = value.trim();
    if (/^-?\d+$/.test(text)) date = new Date(Number(text));
    // SQLite's datetime() and CURRENT_TIMESTAMP are UTC without a zone;
    // `new Date` would read them as local time.
    else if (SQLITE_DATETIME.test(text)) date = new Date(`${text.replace(" ", "T")}Z`);
    else date = new Date(text);
  } else {
    return undefined;
  }
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Better Auth boolean on SQLite (0/1, sometimes "true"/"false") to a boolean. */
export function toBool(value: unknown): boolean | null | undefined {
  if (value === null || value === undefined) return null;
  if (value === 0 || value === false || value === "0" || value === "false") return false;
  if (value === 1 || value === true || value === "1" || value === "true") return true;
  return undefined;
}

function toInteger(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null;
  const n = typeof value === "string" ? Number(value.trim()) : Number(value);
  if (typeof value === "boolean" || !Number.isFinite(n) || (typeof value === "string" && !value.trim())) {
    return undefined;
  }
  return n;
}

function describe(value: unknown) {
  return typeof value === "string" ? JSON.stringify(value.slice(0, 40)) : String(value);
}

// ------------------------------------------------------------------- the copy

function rowLabel(table: TableName, row: Row): string {
  if (table === "app_state") return `key ${describe(row.key)}`;
  if (table === "delivery_counts") return `hour ${describe(row.hour)}, kind ${describe(row.kind)}`;
  return `id ${describe(row.id)}`;
}

/** Converts one source row to the target's column types, or throws naming the row. */
function convertRow(
  table: TableName,
  row: Row,
  columns: Column[],
  rounded: Map<string, number>,
): Row {
  const out: Row = {};
  for (const column of columns) {
    if (!(column.name in row)) continue; // target-only column: its default applies
    const raw = row[column.name];
    let value: unknown;
    switch (column.type) {
      case "boolean":
        value = toBool(raw);
        break;
      case "timestamp with time zone":
      case "timestamp without time zone":
        value = toDate(raw);
        break;
      case "integer":
      case "bigint":
      case "smallint": {
        const n = toInteger(raw);
        if (n !== null && n !== undefined && !Number.isInteger(n)) {
          const key = `${table}.${column.name}`;
          rounded.set(key, (rounded.get(key) ?? 0) + 1);
          value = Math.round(n);
        } else {
          value = n;
        }
        break;
      }
      default:
        value = raw === null || raw === undefined ? null : typeof raw === "string" ? raw : String(raw);
    }
    if (value === undefined) {
      throw new CopyError(
        `${table} (${rowLabel(table, row)}): column "${column.name}" holds ${describe(raw)}, ` +
          `which isn't a valid ${column.type}. Fix the row in a copy of the SQLite file and run again.`,
      );
    }
    if (value === null && !column.nullable) {
      throw new CopyError(`${table} (${rowLabel(table, row)}): column "${column.name}" is empty but required.`);
    }
    out[column.name] = value;
  }
  return out;
}

async function targetColumns(trx: Transaction<Schema>, table: TableName): Promise<Column[]> {
  const { rows } = await sql<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null; is_identity: string }>`
    SELECT column_name, data_type, is_nullable, column_default, is_identity
    FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = ${table}
    ORDER BY ordinal_position
  `.execute(trx);
  if (rows.length === 0) throw new CopyError(`The target has no "${table}" table; its schema didn't migrate.`);
  return rows.map((r) => ({ name: r.column_name, type: r.data_type, nullable: r.is_nullable === "YES" }));
}

function sourceColumns(source: BetterSqlite3.Database, table: TableName): string[] {
  return (source.prepare("SELECT name FROM pragma_table_info(?)").all(table) as { name: string }[]).map((c) => c.name);
}

const quoteSqlite = (name: string) => `"${name.replace(/"/g, '""')}"`;

async function countRows(trx: Transaction<Schema>, table: TableName): Promise<number> {
  const { rows } = await sql<{ n: number | string }>`SELECT COUNT(*) AS n FROM ${sql.table(table)}`.execute(trx);
  return Number(rows[0]?.n ?? 0);
}

/** What the target already holds, as "table: n" lines; empty when it's fresh. */
async function existingData(trx: Transaction<Schema>): Promise<string[]> {
  const found: string[] = [];
  for (const table of TABLES) {
    if (table === "app_state") {
      const keys = (await trx.selectFrom("app_state").select("key").execute())
        .map((r) => r.key)
        .filter((key) => !MARKER_KEYS.has(key));
      if (keys.length) found.push(`app_state: ${keys.length} key(s) (${keys.slice(0, 5).join(", ")}${keys.length > 5 ? ", ..." : ""})`);
      continue;
    }
    const n = await countRows(trx, table);
    if (n) found.push(`${table}: ${n} row(s)`);
  }
  return found;
}

async function emptyTarget(trx: Transaction<Schema>): Promise<void> {
  // One statement, so the foreign keys between them don't matter.
  await sql`TRUNCATE ${sql.join(
    TABLES.filter((t) => t !== "app_state").map((t) => sql.table(t)),
  )}`.execute(trx);
  // schema_version stays: it describes the schema, not the data.
  await trx.deleteFrom("app_state").where("key", "!=", SCHEMA_VERSION_KEY).execute();
}

/** Snapshots the (read-only) source to a temp file and brings the copy to the current schema. */
function snapshotSource(from: string): { source: BetterSqlite3.Database; cleanup: () => void } {
  if (!fs.existsSync(from)) throw new CopyError(`No SQLite database at ${from}.`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openinary-copy-"));
  const copyPath = path.join(dir, "snapshot.db");
  const cleanup = () => fs.rmSync(dir, { recursive: true, force: true });
  try {
    const original = new BetterSqlite3(from, { readonly: true, fileMustExist: true });
    try {
      original.prepare("VACUUM INTO ?").run(copyPath);
    } finally {
      original.close();
    }
    const source = new BetterSqlite3(copyPath);
    // Orphaned rows (SQLite didn't always enforce the foreign keys) would make
    // the apiKey rebuild in migrate() fail; the copy skips them itself.
    source.pragma("foreign_keys = OFF");
    migrateSqliteHandle(source);
    return {
      source,
      cleanup: () => {
        source.close();
        cleanup();
      },
    };
  } catch (error) {
    cleanup();
    if (error instanceof CopyError) throw error;
    throw new CopyError(
      `Could not read the SQLite database at ${from}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

class Rollback extends Error {}

/**
 * Copies the SQLite database at `from` into the Postgres database at `to`.
 * Throws a {@link CopyError} for a refused or failed copy (nothing written);
 * returns the per-table report otherwise.
 */
export async function copySqliteToPostgres(options: CopyOptions): Promise<CopyReport> {
  const log = options.log ?? ((line: string) => console.log(line));
  const dryRun = !!options.dryRun;
  const batchSize = Math.max(1, options.batchSize ?? 500);
  const notes: string[] = [];

  log(`Source: ${options.from} (read-only, copied to a temp file and migrated there)`);
  const { source, cleanup } = snapshotSource(options.from);
  let target: Database | undefined;
  try {
    target = await openDatabase({ dialect: "postgres", url: options.to, poolMax: 2, schema: options.schema });
    log(`Target: ${target.location}${dryRun ? " (dry run: rolled back at the end)" : ""}`);

    // Users first: the children skip rows whose user is gone.
    const userIds = new Set(
      (source.prepare(`SELECT id FROM "user"`).all() as { id: string }[]).map((r) => r.id),
    );

    const reports: TableReport[] = [];
    const rounded = new Map<string, number>();

    const run = async (trx: Transaction<Schema>) => {
      const found = await existingData(trx);
      if (found.length) {
        if (!options.truncate) {
          throw new CopyError(
            `The target database already holds data:\n  ${found.join("\n  ")}\n` +
              "Nothing was copied. Point --to at an empty database, or pass --truncate to empty " +
              "these tables first (inside the same transaction: a failed copy leaves them as they were).",
          );
        }
        log(`Emptying the target first (--truncate):\n  ${found.join("\n  ")}`);
        await emptyTarget(trx);
      }

      // Copied rows keep their roles: the trigger would make the first one admin.
      await sql`ALTER TABLE "user" DISABLE TRIGGER "first_user_is_admin"`.execute(trx);

      for (const table of TABLES) {
        const columns = await targetColumns(trx, table);
        const targetNames = new Set(columns.map((c) => c.name));
        const available = sourceColumns(source, table);
        if (available.length === 0) {
          throw new CopyError(`The source has no "${table}" table.`);
        }
        for (const name of available) {
          if (targetNames.has(name)) continue;
          const why = DROPPED_COLUMNS[`${table}.${name}`];
          notes.push(`${table}.${name} is not copied (${why ?? "no such column in the Postgres schema"}).`);
        }
        const copyable = columns.filter((c) => available.includes(c.name));
        const select = copyable.map((c) => quoteSqlite(c.name)).join(", ");
        const perBatch = Math.max(1, Math.min(batchSize, Math.floor(MAX_PARAMS / Math.max(1, copyable.length))));
        const where = table === "app_state" ? `AND key NOT IN (${[...SKIPPED_KEYS].map(() => "?").join(", ")})` : "";
        const whereParams = table === "app_state" ? [...SKIPPED_KEYS] : [];
        const total = (
          source.prepare(`SELECT COUNT(*) AS n FROM ${quoteSqlite(table)} WHERE 1 = 1 ${where}`).get(...whereParams) as { n: number }
        ).n;
        const page = source.prepare(
          `SELECT rowid AS __rowid, ${select} FROM ${quoteSqlite(table)} WHERE rowid > ? ${where} ORDER BY rowid LIMIT ?`,
        );

        const report: TableReport = { table, source: total, skipped: 0, copied: 0, target: 0 };
        let lastRowid = Number.MIN_SAFE_INTEGER;
        let lastLogged = 0;
        for (;;) {
          const rows = page.all(lastRowid, ...whereParams, perBatch) as Row[];
          if (rows.length === 0) break;
          lastRowid = rows[rows.length - 1]!.__rowid as number;
          const batch: Row[] = [];
          for (const row of rows) {
            delete row.__rowid;
            const ref = USER_REF[table];
            if (ref && !userIds.has(row[ref] as string)) {
              report.skipped++;
              continue;
            }
            batch.push(convertRow(table, row, copyable, rounded));
          }
          if (batch.length) {
            const insert = trx.insertInto(table as "app_state").values(batch as never);
            await (table === "app_state"
              ? insert.onConflict((oc) => oc.column("key").doUpdateSet((eb) => ({ value: eb.ref("excluded.value") })))
              : insert
            ).execute();
            report.copied += batch.length;
          }
          if (total >= 10_000 && report.copied - lastLogged >= 50_000) {
            lastLogged = report.copied;
            log(`  ${table}: ${report.copied} / ${total}...`);
          }
        }

        if (table === "delivery_log") {
          // Ids were copied explicitly; the identity continues after the largest.
          await sql`
            SELECT setval(pg_get_serial_sequence('"delivery_log"', 'id'), COALESCE(MAX("id"), 1), MAX("id") IS NOT NULL)
            FROM "delivery_log"
          `.execute(trx);
        }

        if (table === "app_state") {
          const copiedKeys = (
            source.prepare(`SELECT key FROM app_state WHERE 1 = 1 ${where}`).all(...whereParams) as { key: string }[]
          ).map((r) => r.key);
          report.target = copiedKeys.length
            ? Number(
                (
                  await trx
                    .selectFrom("app_state")
                    .select((eb) => eb.fn.countAll().as("n"))
                    .where("key", "in", copiedKeys)
                    .executeTakeFirstOrThrow()
                ).n,
              )
            : 0;
        } else {
          report.target = await countRows(trx, table);
        }
        log(
          `  ${table.padEnd(16)} ${String(report.copied).padStart(8)} copied` +
            (report.skipped ? `, ${report.skipped} skipped (their user no longer exists)` : ""),
        );
        reports.push(report);
      }

      await sql`ALTER TABLE "user" ENABLE TRIGGER "first_user_is_admin"`.execute(trx);

      for (const [column, n] of rounded) notes.push(`${column}: ${n} non-integer value(s) rounded.`);
      const mismatched = reports.filter((r) => r.target !== r.source - r.skipped);
      if (mismatched.length) {
        throw new CopyError(
          `Row counts don't match after the copy, so nothing was committed:\n  ${mismatched
            .map((r) => `${r.table}: expected ${r.source - r.skipped}, found ${r.target}`)
            .join("\n  ")}`,
        );
      }
      if (dryRun) throw new Rollback();
    };

    try {
      await target.transaction().execute(run);
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }

    log("");
    log(summaryTable(reports));
    for (const note of notes) log(`Note: ${note}`);
    log(
      dryRun
        ? "Dry run: every row fits the Postgres schema. Nothing was kept; run again without --dry-run to copy."
        : "Copied and verified. Start Openinary with DATABASE_URL set (and the same BETTER_AUTH_SECRET).",
    );
    return { tables: reports, dryRun, notes, ok: true };
  } finally {
    cleanup();
    await target?.close().catch(() => {});
  }
}

export function summaryTable(reports: TableReport[]): string {
  const header = ["table", "source", "skipped", "target", "check"];
  const rows = reports.map((r) => [
    r.table,
    String(r.source),
    String(r.skipped),
    String(r.target),
    r.target === r.source - r.skipped ? "ok" : "MISMATCH",
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i]!.length)));
  const line = (cells: string[]) =>
    cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]!) : c.padStart(widths[i]!))).join("  ").trimEnd();
  return [line(header), line(widths.map((w) => "-".repeat(w))), ...rows.map(line)].join("\n");
}

// ------------------------------------------------------------------------ CLI

const USAGE = `Copy an Openinary SQLite database into Postgres.

Usage: sqlite-to-postgres [--from <sqlite file>] [--to <postgres url>] [options]

  --from <path>     The SQLite file. Default: DB_PATH, else data/auth.db.
                    Opened read-only; never modified.
  --to <url>        postgres://... Default: DATABASE_URL.
  --dry-run         Copy inside a transaction, verify, then roll back.
  --truncate        Empty the target's tables first (same transaction) instead
                    of refusing a target that already holds data.
  --schema <name>   Use this Postgres schema instead of the URL's default.
  --batch-size <n>  Rows per INSERT (default 500).
  -h, --help        This help.
`;

/** Replaces the URL's password anywhere in a message. */
function redactIn(message: string, url: string | undefined): string {
  if (!url) return message;
  try {
    const password = decodeURIComponent(new URL(url).password);
    let out = message.split(url).join(redactUrl(url));
    if (password) out = out.split(password).join("***");
    return out;
  } catch {
    return message;
  }
}

export async function main(argv: string[], env: Record<string, string | undefined> = process.env): Promise<number> {
  // `pnpm run script -- --flag` may pass the `--` through.
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  let values: ReturnType<typeof parse>["values"];
  function parse(a: string[]) {
    return parseArgs({
      args: a,
      options: {
        from: { type: "string" },
        to: { type: "string" },
        "dry-run": { type: "boolean" },
        truncate: { type: "boolean" },
        schema: { type: "string" },
        "batch-size": { type: "string" },
        help: { type: "boolean", short: "h" },
      },
      strict: true,
      allowPositionals: false,
    });
  }
  try {
    values = parse(args).values;
  } catch (error) {
    console.error(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`);
    return 2;
  }
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  // pnpm --filter runs scripts from packages/shared; a relative --from means
  // the directory the command was typed in.
  const from = values.from ? path.resolve(env.INIT_CWD || process.cwd(), values.from) : resolveDbPath(env);
  const to = values.to?.trim() || env.DATABASE_URL?.trim();
  if (!to) {
    console.error(`No target: pass --to postgres://... or set DATABASE_URL.\n\n${USAGE}`);
    return 2;
  }
  if (!/^postgres(ql)?:\/\//i.test(to)) {
    console.error("--to must be a Postgres URL (postgres://... or postgresql://...).");
    return 2;
  }
  const batchSize = values["batch-size"] ? Number(values["batch-size"]) : undefined;
  if (batchSize !== undefined && (!Number.isInteger(batchSize) || batchSize < 1)) {
    console.error("--batch-size must be a positive integer.");
    return 2;
  }
  try {
    await copySqliteToPostgres({
      from,
      to,
      schema: values.schema,
      dryRun: values["dry-run"],
      truncate: values.truncate,
      batchSize,
      log: (line) => console.log(redactIn(line, to)),
    });
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n${error instanceof CopyError ? "" : "Copy failed: "}${redactIn(message, to)}`);
    if (!(error instanceof CopyError)) console.error("Nothing was committed: the copy runs in one transaction.");
    return 1;
  }
}

const invokedDirectly = (() => {
  try {
    return !!process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
