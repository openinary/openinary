import { createAuthClientInstance } from "shared/auth-client";

// Create the auth client for Next.js app
export const authClient = createAuthClientInstance(
  typeof window !== "undefined" ? window.location.origin : "http://localhost:3001"
);

export const { signIn, signOut, signUp, useSession } = authClient;