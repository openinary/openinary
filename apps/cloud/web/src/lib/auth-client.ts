import {
  adminClient,
  emailOTPClient,
  lastLoginMethodClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_SERVER_URL,
  // adminClient for impersonation only: it types session.impersonatedBy and
  // provides stopImpersonating (see app-shell.tsx). Every other admin call
  // is refused server-side to anyone but ADMIN_USER_ID.
  plugins: [emailOTPClient(), lastLoginMethodClient(), adminClient()],
});
