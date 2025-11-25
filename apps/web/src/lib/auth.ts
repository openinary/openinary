// Re-export auth from shared package (server-side only)
// This maintains compatibility with existing code while using the shared configuration
export { auth } from "shared/auth";
export type { AuthSession, AuthUser } from "shared";

