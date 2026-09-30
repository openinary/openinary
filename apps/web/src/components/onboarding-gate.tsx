"use client";

import { Onboarding, useOpeninary } from "@openinary/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { authClient, useSession } from "@/lib/auth-client";

export interface OnboardingState {
  completed: boolean;
  /** Instance-wide, shown in the sidebar. Null until someone onboards. */
  workspace: { name: string; logo: string | null } | null;
  telemetry: boolean;
}

/** Also what the sidebar reads the workspace name and logo from. */
export function useOnboardingState() {
  const { apiBaseUrl, fetch } = useOpeninary();
  return useQuery({
    queryKey: ["openinary", "onboarding-state", apiBaseUrl],
    queryFn: async (): Promise<OnboardingState> => {
      const res = await fetch(`${apiBaseUrl}/onboarding`);
      if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
      return res.json();
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/**
 * Covers the dashboard with the first-run questionnaire until the signed-in
 * account has answered it. Rendered over the page rather than instead of it,
 * so accounts that are done never wait on this request.
 */
export function OnboardingGate() {
  const { apiBaseUrl, fetch } = useOpeninary();
  const { data: session } = useSession();
  const state = useOnboardingState();
  const queryClient = useQueryClient();
  const router = useRouter();

  const data = state.data;
  if (!session?.user || !data || data.completed) return null;

  return (
    <Onboarding
      variant="self-hosted"
      user={session.user}
      workspace={{ name: data.workspace?.name, logo: data.workspace?.logo }}
      workspaceMark={
        <img src="/icon.svg" alt="" className="size-6 p-0.5 dark:invert" />
      }
      note={
        data.telemetry ? (
          <>
            Your role, use cases and this answer are sent anonymously to help
            shape Openinary. Set <code>OPENINARY_TELEMETRY=false</code> to keep
            them on this server.
          </>
        ) : undefined
      }
      onComplete={async (answers) => {
        const updated = await authClient.updateUser({
          name: answers.name,
          image: answers.image,
        });
        if (updated.error) throw new Error(updated.error.message);

        const workspace = {
          name: answers.workspaceName,
          logo: answers.workspaceLogo,
        };
        const res = await fetch(`${apiBaseUrl}/onboarding`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: answers.role,
            useCases: answers.useCases,
            source: answers.source,
            workspace,
          }),
        });
        if (!res.ok) throw new Error("Could not save your answers");

        router.push("/get-started");
        queryClient.setQueryData<OnboardingState>(
          ["openinary", "onboarding-state", apiBaseUrl],
          { ...data, completed: true, workspace },
        );
      }}
    />
  );
}
