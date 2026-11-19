"use client";

import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

type Role = "owner" | "admin" | "member";
type Action = "bucket.manage" | "apiKey.manage" | "member.manage" | "billing";

// Mirrors `can()` in apps/cloud/server/worker/lib/account.ts, which is what
// actually enforces it. This copy only hides what the server would refuse.
const ALLOWED: Record<Role, readonly Action[]> = {
  owner: ["bucket.manage", "apiKey.manage", "member.manage", "billing"],
  admin: ["bucket.manage", "apiKey.manage", "member.manage"],
  member: [],
};

/**
 * Which account this session acts on (its own, or a team it joined), the
 * caller's role there, and every account it can switch to. Until the first
 * answer arrives everyone is treated as the owner of their own account, which
 * is what every account was before teams.
 */
export function useAccount() {
  const { data } = useQuery({
    ...orpc.team.overview.queryOptions(),
    staleTime: 60_000,
  });
  const role: Role = data?.role ?? "owner";
  return {
    /** False until the first answer: filter nothing on it before then. */
    loaded: data !== undefined,
    teamsEnabled: data?.enabled ?? false,
    role,
    current: data?.current,
    accounts: data?.accounts ?? [],
    can: (action: Action) => ALLOWED[role].includes(action),
  };
}
