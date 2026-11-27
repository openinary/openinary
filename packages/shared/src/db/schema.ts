import type { ColumnType, Generated } from "kysely";

/**
 * Table types for Kysely, valid on both dialects. Where SQLite and Postgres
 * store a value differently (Better Auth's booleans and timestamps), the
 * select type is the union of both and the insert/update type is the one
 * form both accept:
 *
 * - booleans: SQLite 0/1, Postgres boolean. Write 0 or 1 as a bound
 *   parameter (Postgres parses '1'/'0' into a boolean column), read with `!!`.
 * - timestamps: SQLite ISO text (what Better Auth writes there; very old rows
 *   may hold epoch ms), Postgres timestamptz (a Date). Write an ISO string,
 *   read with `new Date(value)`.
 *
 * The app's own tables keep integer epoch-ms columns on both dialects
 * (BIGINT on Postgres, parsed back to number), so they read the same.
 */

/** Better Auth boolean: 0/1 on SQLite, boolean on Postgres. */
export type DbBool = ColumnType<number | boolean, 0 | 1, 0 | 1>;
export type NullableDbBool = ColumnType<number | boolean | null, 0 | 1 | null | undefined, 0 | 1 | null>;

/** Better Auth timestamp: ISO text (or legacy epoch ms) on SQLite, Date on Postgres. */
export type DbTimestamp = ColumnType<Date | string | number, string, string>;
export type NullableDbTimestamp = ColumnType<
  Date | string | number | null,
  string | null | undefined,
  string | null
>;

/** A column with a database default: optional on insert. */
type WithDefault<T> = ColumnType<T, T | undefined, T>;

export interface UserTable {
  id: string;
  email: string;
  emailVerified: ColumnType<number | boolean, 0 | 1 | undefined, 0 | 1>;
  name: string;
  createdAt: DbTimestamp;
  updatedAt: DbTimestamp;
  image: string | null;
  role: string | null;
  banned: NullableDbBool;
  banReason: string | null;
  banExpires: NullableDbTimestamp;
}

export interface SessionTable {
  id: string;
  userId: string;
  expiresAt: DbTimestamp;
  token: string;
  createdAt: DbTimestamp;
  updatedAt: DbTimestamp;
  ipAddress: string | null;
  userAgent: string | null;
  impersonatedBy: string | null;
}

export interface AccountTable {
  id: string;
  userId: string;
  accountId: string;
  providerId: string;
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
  accessTokenExpiresAt: NullableDbTimestamp;
  refreshTokenExpiresAt: NullableDbTimestamp;
  scope: string | null;
  password: string | null;
  createdAt: DbTimestamp;
  updatedAt: DbTimestamp;
}

export interface VerificationTable {
  id: string;
  identifier: string;
  value: string;
  expiresAt: DbTimestamp;
  createdAt: NullableDbTimestamp;
  updatedAt: NullableDbTimestamp;
}

export interface ApiKeyTable {
  id: string;
  name: string | null;
  start: string | null;
  prefix: string | null;
  key: string;
  referenceId: string;
  configId: WithDefault<string>;
  refillInterval: number | null;
  refillAmount: number | null;
  lastRefillAt: NullableDbTimestamp;
  enabled: ColumnType<number | boolean, 0 | 1 | undefined, 0 | 1>;
  rateLimitEnabled: ColumnType<number | boolean, 0 | 1 | undefined, 0 | 1>;
  rateLimitTimeWindow: number | null;
  rateLimitMax: number | null;
  requestCount: WithDefault<number>;
  remaining: number | null;
  lastRequest: NullableDbTimestamp;
  expiresAt: NullableDbTimestamp;
  createdAt: DbTimestamp;
  updatedAt: DbTimestamp;
  /** JSON text. */
  permissions: string | null;
  /** JSON text. */
  metadata: string | null;
}

export type VideoJobStatus = "pending" | "processing" | "completed" | "error" | "cancelled";

export interface VideoJobsTable {
  id: string;
  file_path: string;
  params_json: string;
  cache_path: string;
  status: VideoJobStatus;
  priority: WithDefault<number>;
  progress: WithDefault<number>;
  error: string | null;
  retry_count: WithDefault<number>;
  max_retries: WithDefault<number>;
  /** Epoch ms. */
  created_at: number;
  /** Epoch ms. */
  started_at: number | null;
  /** Epoch ms. */
  completed_at: number | null;
}

/** Key/value settings and markers (secret_hash, instance_id, schema_version...). */
export interface AppStateTable {
  key: string;
  value: string;
}

export interface DeliveryLogTable {
  id: Generated<number>;
  /** Epoch ms. */
  t: number;
  path: string;
  kind: string;
  /** HTTP status. */
  status: number;
}

export interface DeliveryCountsTable {
  /** Epoch ms, floored to the hour. */
  hour: number;
  kind: string;
  delivered: number;
  failed: number;
}

/** Every table the instance owns, as Kysely sees them. */
export interface Schema {
  user: UserTable;
  session: SessionTable;
  account: AccountTable;
  verification: VerificationTable;
  apiKey: ApiKeyTable;
  video_jobs: VideoJobsTable;
  app_state: AppStateTable;
  delivery_log: DeliveryLogTable;
  delivery_counts: DeliveryCountsTable;
}
