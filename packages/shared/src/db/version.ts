/**
 * The schema version this code creates and expects, on both dialects. Bump
 * it with a new step in migrate-sqlite.ts and migrate-postgres.ts. Stored in
 * app_state under SCHEMA_VERSION_KEY; a database at a higher version (a newer
 * release ran on it) is left alone, so older nodes keep working during a
 * rolling upgrade as long as each step is backwards compatible.
 */
export const SCHEMA_VERSION = 1;

export const SCHEMA_VERSION_KEY = "schema_version";
