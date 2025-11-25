// Export shared types and utilities
export * from "./types";

// Note: Don't export auth server instance here to avoid importing
// better-sqlite3 on the client side. Import directly from "./auth.js" 
// in server-side code only.
export type { AuthSession, AuthUser } from "./auth";
