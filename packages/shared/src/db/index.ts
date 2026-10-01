// Prisma DB core — single client for better-auth and app stores.
// Postgres only; connection string comes from DATABASE_URL.
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "../generated/prisma/client.js";

export type { PrismaClient } from "../generated/prisma/client.js";

let client: PrismaClient | undefined;
let initError: Error | undefined;
// In-flight/successful init. Concurrent callers share this promise; it resets
// to undefined on failure so a later retry actually retries (F2 major-4).
let initPromise: Promise<void> | undefined;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// prisma/migrations lives next to src/'s parent (packages/shared/prisma).
// Resolve from the source file so it works in dev (src) and builds (dist,
// whose add-js-extensions script keeps relative structure: dist/../prisma).
const prismaDir = path.resolve(__dirname, "../../prisma");

/**
 * Apply pending migrations (`prisma migrate deploy`) before the client is
 * handed out. Runs the Prisma CLI as a child process — the documented
 * programmatic approach for deploy (no runtime migrator API is exposed by
 * @prisma/client). Safe to run concurrently/repeatedly: deploy is
 * transactional per migration and recorded in _prisma_migrations.
 */
function runMigrateDeploy(databaseUrl: string): void {
  const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
  };
  try {
    execFileSync(
      npxCommand,
      ["prisma", "migrate", "deploy", `--schema=${path.join(prismaDir, "schema.prisma")}`],
      { env, stdio: ["ignore", "inherit", "inherit"], cwd: prismaDir, timeout: 120_000 },
    );
  } catch (err) {
    initError = new Error(
      "prisma migrate deploy failed during initDb(). " +
        "Check the migration output above and your DATABASE_URL. " +
        (err instanceof Error ? `Underlying error: ${err.message}` : String(err)),
    );
    throw initError;
  }
}

/**
 * Create the PrismaClient singleton, apply pending migrations, verify
 * connectivity, and initialize the auth layer. Fail-fast with an actionable
 * message when DATABASE_URL is missing or the database is unreachable.
 * Concurrent callers share a single init; after success a second call no-ops;
 * after failure the memoized promise is dropped so a retry actually retries.
 */
export async function initDb(): Promise<void> {
  if (client) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Clear any previous failed-init error before retrying.
    initError = undefined;

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      initError = new Error(
        "DATABASE_URL is not set. Openinary requires PostgreSQL. " +
          "Set DATABASE_URL (e.g. postgres://user:password@localhost:5432/openinary) in your environment."
      );
      throw initError;
    }

    runMigrateDeploy(databaseUrl);

    const created = new PrismaClient();
    try {
      await created.$queryRaw`SELECT 1`;
    } catch (err) {
      await created.$disconnect().catch(() => {});
      initError = new Error(
        `Cannot connect to PostgreSQL via DATABASE_URL (${databaseUrl.replace(/:[^:@/]+@/, ":***@")}). ` +
          `Ensure the database is running and reachable. ` +
          (err instanceof Error ? `Underlying error: ${err.message}` : String(err)),
        { cause: err }
      );
      throw initError;
    }

    // Auth is part of the DB lifecycle now (todo 4): construct better-auth on
    // the Prisma adapter and run the secret-hash check after migrations.
    // initAuth resolves the shared client via getDb(), so `client` is
    // assigned before it runs — but on initAuth failure the client is torn
    // down and unset, so a retry re-runs the whole init instead of wedging
    // forever on a half-initialized singleton (F2 major-4).
    client = created;
    try {
      const { initAuth } = await import("../auth.js");
      await initAuth();
    } catch (err) {
      client = undefined;
      await created.$disconnect().catch(() => {});
      throw err;
    }
  })();

  try {
    await initPromise;
  } catch (err) {
    initPromise = undefined;
    throw err;
  }
}

/**
 * Get the shared PrismaClient. Throws if initDb() has not succeeded yet.
 */
export function getDb(): PrismaClient {
  if (!client) {
    if (initError) throw initError;
    throw new Error(
      "Database not initialized. Call and await initDb() (from @openinary/shared/db) before accessing the database."
    );
  }
  return client;
}
