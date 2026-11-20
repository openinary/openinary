"use client";

import { Page, useDocumentTitle } from "@openinary/dashboard";
import { Button } from "@openinary/dashboard/ui/button";
import { SettingsSection, Spinner } from "@openinary/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

/**
 * Where an invitation email lands. Inside the (app) group, so AppShell signs
 * the person in (or up) first; better-auth then checks the invitation was
 * sent to that verified address. Accepting moves the session into the team.
 */
export function InviteView({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);

  const invitation = useQuery({
    queryKey: ["invitation", id],
    queryFn: async () => {
      const { data, error } = await authClient.organization.getInvitation({
        query: { id },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    retry: false,
  });

  const respond = async (action: "accept" | "decline") => {
    setBusy(action);
    const { error } =
      action === "accept"
        ? await authClient.organization.acceptInvitation({ invitationId: id })
        : await authClient.organization.rejectInvitation({ invitationId: id });
    if (error) {
      toast.error(error.message ?? "Something went wrong");
      setBusy(null);
      return;
    }
    // Accepting made the team the active account: every cache is the old one.
    await queryClient.invalidateQueries();
    if (action === "accept") toast.success(`Welcome to ${invitation.data?.organizationName}`);
    router.push("/");
  };

  const data = invitation.data;
  useDocumentTitle(data ? `Join ${data.organizationName}` : "Team invitation");

  return (
    <Page title="Team invitation" className="max-w-xl">
      <SettingsSection
        title={
          data
            ? `Join ${data.organizationName}`
            : invitation.isError
              ? "This invitation isn't available"
              : "Loading invitation"
        }
        description={
          data
            ? `${data.inviterEmail} invited you as ${data.role}. You'll keep your own account too, and can switch between them from the sidebar.`
            : invitation.isError
              ? "It may have expired, been cancelled, or been sent to another email address. Ask for a new one."
              : undefined
        }
      >
        {invitation.isLoading && <Spinner className="size-4" />}
        {data && (
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={() => respond("accept")}
            >
              {busy === "accept" ? "Joining…" : "Accept"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => respond("decline")}
            >
              Decline
            </Button>
          </div>
        )}
        {invitation.isError && (
          <Button size="sm" variant="outline" onClick={() => router.push("/")}>
            Go to my dashboard
          </Button>
        )}
      </SettingsSection>
    </Page>
  );
}
