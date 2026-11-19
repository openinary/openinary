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
  // Set on the sessions the admin panel opens to support a customer (better
  // auth's /admin/impersonate-user): the admin's user id. The customer
  // dashboard reads it to show its "viewing as" banner and to stay out of the
  // customer's analytics and support identity.
  impersonatedBy: text("impersonated_by"),
  // better-auth organization plugin: the team account this session acts on.
  // Null means the user's own account (see worker/lib/account.ts).
  activeOrganizationId: text("active_organization_id"),
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
 * (see worker/routes/tenant.ts).
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

/**
 * Teams, in the shape better-auth's organization plugin expects (property
 * names are what the drizzle adapter looks up). One organization per owner,
 * created by worker/rpc/team.ts, never by the user. `ownerUserId` is the
 * account id every tenant key already uses (R2 prefix, Autumn customer,
 * UsageMeter, BUCKET_OWNERS), so joining a team never moves data.
 */
export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  createdAt: timestamp("created_at").notNull(),
  metadata: text("metadata"),
  ownerUserId: text("owner_user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const member = pgTable("member", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  createdAt: timestamp("created_at").notNull(),
  // The bucket this person views inside the team, so one member switching
  // doesn't move everyone (the owner keeps bucket.active). No FK: bucket.ts
  // can't be imported here (see schema/bucket.ts), and a stale id falls back.
  activeBucketId: text("active_bucket_id"),
});

export const invitation = pgTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role"),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  inviterId: text("inviter_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});
