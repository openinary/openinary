/**
 * Who may do what on a self-hosted instance. Browser-safe (no Node imports):
 * the API enforces it and the dashboard reads it to hide what a role can't do.
 *
 * Same shape as Cloud's `can(role, action)`, with the roles a single instance
 * needs: there is no owner or billing, and a read-only `viewer` replaces it.
 */
export const ROLES = ["admin", "member", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export type Action =
  /** Browse files, folders, stats, the queue and the delivery log; download. */
  | "media:read"
  /** Upload, create folders, rename, move, delete, invalidate, clear cache. */
  | "media:write"
  /** Retry, cancel and delete video jobs. */
  | "queue:manage"
  /** Create, rename and delete one's own API keys. */
  | "apiKeys:manage"
  /** Instance-wide settings, such as the workspace name and logo. */
  | "settings:manage"
  /** List users, change roles, ban, remove and add users. */
  | "users:manage";

const VIEWER: readonly Action[] = ["media:read"];
const MEMBER: readonly Action[] = [...VIEWER, "media:write", "queue:manage", "apiKeys:manage"];
const ADMIN: readonly Action[] = [...MEMBER, "settings:manage", "users:manage"];

const MATRIX: Record<Role, ReadonlySet<Action>> = {
  viewer: new Set(VIEWER),
  member: new Set(MEMBER),
  admin: new Set(ADMIN),
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/**
 * Whether `role` may perform `action`. Anything that isn't a known role
 * (null, a typo, a role from a newer release) gets nothing.
 */
export function can(role: unknown, action: Action): boolean {
  return isRole(role) && MATRIX[role].has(action);
}

/** What a request needs, from its method: reads are reads, the rest writes. */
export function mediaActionFor(method: string): Action {
  const m = method.toUpperCase();
  return m === "GET" || m === "HEAD" || m === "OPTIONS" ? "media:read" : "media:write";
}
