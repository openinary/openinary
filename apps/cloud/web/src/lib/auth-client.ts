import {
  adminClient,
  emailOTPClient,
  lastLoginMethodClient,
  organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_SERVER_URL,
  // adminClient for impersonation only: it types session.impersonatedBy and
  // provides stopImpersonating (see app-shell.tsx). Every other admin call
  // is refused server-side to anyone but ADMIN_USER_ID.
  //
  // organizationClient for the invite page only (read, accept, decline an
  // invitation). Team management goes through oRPC (rpc/team.ts).
  plugins: [
    emailOTPClient(),
    lastLoginMethodClient(),
    adminClient(),
    organizationClient(),
  ],
});
