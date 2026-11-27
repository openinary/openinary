"use client";

import { useQuery } from "@tanstack/react-query";

import { type AuthOptions, PASSWORD_ONLY } from "@/lib/validate-auth-config";

/**
 * The sign-in methods this instance offers: whether the Add user form asks
 * for a password (SSO-only instances don't), and which providers onboarding
 * shows as set up.
 */
export function useAuthOptions() {
  return useQuery({
    queryKey: ["openinary", "auth-options"],
    queryFn: async (): Promise<AuthOptions> => {
      const res = await fetch("/api/auth/config");
      if (!res.ok) return PASSWORD_ONLY;
      const config = await res.json();
      return typeof config.passwordLogin === "boolean"
        ? { providers: config.providers ?? [], passwordLogin: config.passwordLogin }
        : PASSWORD_ONLY;
    },
    staleTime: Number.POSITIVE_INFINITY,
  }).data;
}
