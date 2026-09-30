// Prisma DB core — single client for better-auth (todo 4) and app stores (todo 5+).
// Postgres only; connection string comes from DATABASE_URL.
import { PrismaClient } from "../generated/prisma/client.js";

export type { PrismaClient } from "../generated/prisma/client.js";

let client: PrismaClient | undefined;
let initError: Error | undefined;

/**
 * Create the PrismaClient singleton and verify connectivity.
 * Fail-fast with an actionable message when DATABASE_URL is missing
 * or the database is unreachable. Idempotent: a second call no-ops.
 */
export async function initDb(): Promise<void> {
  if (client) return;
  // Clear any previous failed-init error before retrying.
  initError = undefined;

  if (!process.env.DATABASE_URL) {
    initError = new Error(
      "DATABASE_URL is not set. Openinary requires PostgreSQL. " +
        "Set DATABASE_URL (e.g. postgres://user:password@localhost:5432/openinary) in your environment."
    );
    throw initError;
  }

  const created = new PrismaClient();
  try {
    await created.$queryRaw`SELECT 1`;
  } catch (err) {
    await created.$disconnect().catch(() => {});
    initError = new Error(
      `Cannot connect to PostgreSQL via DATABASE_URL (${process.env.DATABASE_URL.replace(/:[^:@/]+@/, ":***@")}). ` +
        `Ensure the database is running and reachable. ` +
        (err instanceof Error ? `Underlying error: ${err.message}` : String(err)),
      { cause: err }
    );
    throw initError;
  }

  client = created;
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
