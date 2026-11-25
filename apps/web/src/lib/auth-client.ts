import { createAuthClientInstance } from "shared/auth-client";
import { isRole, type Role } from "shared/permissions";

export const authClient = createAuthClientInstance(
  typeof window !== "undefined" ? window.location.origin : "http://localhost:3001"
);

export const { signIn, signOut, signUp, useSession } = authClient;

/**
 * The signed-in user's role: undefined while the session loads, null when
 * there is no session or the role isn't one this release knows. Only for
 * hiding what a role can't do; the API refuses it either way.
 */
export function useRole(): Role | null | undefined {
  const { data, isPending } = useSession();
  if (isPending) return undefined;
  const role = data?.user.role;
  return isRole(role) ? role : null;
}
