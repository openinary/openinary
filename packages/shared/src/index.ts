// Export shared types and utilities
export * from "./types";

// Note: Don't export the auth server instance here to avoid importing
// better-auth on the client side. Import directly from "./auth.js"
// in server-side code only.
export type { AuthSession, AuthUser } from "./auth";

// Export database access for server-side use (video queue, etc.)
// Lazy accessors — only usable after initDb() has run.
// WARNING: Server-side only - do not import in client code
export { db } from "./auth";
