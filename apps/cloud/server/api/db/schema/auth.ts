import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),

  // --- better-auth admin plugin (see its schema.ts) ---
  // Declared here because the drizzle adapter builds its SELECTs from this
  // table: a field the plugin knows about but this file doesn't makes every
  // user read fail, not just the admin routes.
  role: text("role"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),

  /**
   * Service cut off by an admin, as opposed to `banned` (which only stops
   * sign-in - see the plugin's session.create hook). The enforcement copy
   * lives in the BUCKET_OWNERS KV value, which is what the CDN path actually
   * reads; this column is the source of truth the admin UI lists and filters
   * on, so a suspended account is visible without one KV read per bucket.
   */
  suspended: boolean("suspended").notNull().default(false),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  // Never written: impersonation is deliberately not exposed (see
  // routers/admin.ts). The admin plugin declares the field regardless, and the
  // drizzle adapter selects every declared field, so the column has to exist.
  impersonatedBy: text("impersonated_by"),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

/**
 * Shape mandated by better-auth's apiKey plugin (see its apiKeySchema) - the
 * drizzle adapter looks fields up by the property names below, so they must
 * stay camelCase even though the columns are snake_case.
 *
 * `metadata` is where a key's bucket scope lives: `{ bucketId }` pins the key
 * to one bucket, and its absence means "every bucket, follow the active one"
 * (see worker/app.ts's requireTenant).
 */
export const apikey = pgTable("apikey", {
  id: text("id").primaryKey(),
  // Which apiKey({...}) config in lib/auth.ts a key was minted under; we only
  // declare one, so every row carries the plugin's "default".
  configId: text("config_id").notNull().default("default"),
  name: text("name"),
  start: text("start"),
  prefix: text("prefix"),
  key: text("key").notNull(),
  referenceId: text("reference_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  refillInterval: integer("refill_interval"),
  refillAmount: integer("refill_amount"),
  lastRefillAt: timestamp("last_refill_at"),
  enabled: boolean("enabled").default(true),
  rateLimitEnabled: boolean("rate_limit_enabled").default(false),
  rateLimitTimeWindow: integer("rate_limit_time_window"),
  rateLimitMax: integer("rate_limit_max"),
  requestCount: integer("request_count").default(0),
  remaining: integer("remaining"),
  lastRequest: timestamp("last_request"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  permissions: text("permissions"),
  metadata: text("metadata"),
});
