import { createAuthClientInstance } from "shared/auth-client";

export const authClient = createAuthClientInstance(
  typeof window !== "undefined" ? window.location.origin : "http://localhost:3001"
);

export const { signIn, signOut, signUp, useSession } = authClient;
