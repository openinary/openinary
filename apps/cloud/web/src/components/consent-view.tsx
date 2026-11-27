"use client";

import { Page, useDocumentTitle } from "@openinary/dashboard";
import { Button } from "@openinary/dashboard/ui/button";
import { SettingsSection, Spinner } from "@openinary/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

/**
 * Where the OAuth server sends someone to approve an agent (Claude Code,
 * Cursor...) connecting through the MCP server. Inside the (app) group, so
 * AppShell signs them in first. The query string is the server's signed
 * authorization request; the client plugin sends it back with the answer.
 *
 * The agent acts on the account active right now (the sidebar switcher), and
 * keeps that account even if they switch later.
 */
export function ConsentView() {
  const [busy, setBusy] = useState<"allow" | "deny" | null>(null);
  const clientId =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("client_id");
  const activeTeam = authClient.useActiveOrganization();

  const client = useQuery({
    queryKey: ["oauth-client", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await authClient.oauth2.publicClient({
        query: { client_id: clientId as string },
      });
      if (error) throw new Error(error.message);
      return data as { client_name?: string };
    },
    retry: false,
  });

  const name = client.data?.client_name || "An agent";
  const account = activeTeam.data?.name ?? "your personal account";
  useDocumentTitle(`Connect ${name}`);

  const respond = async (accept: boolean) => {
    setBusy(accept ? "allow" : "deny");
    const { data, error } = await authClient.oauth2.consent({ accept });
    if (error) {
      toast.error(error.message ?? "Something went wrong");
      setBusy(null);
      return;
    }
    // Back to the agent: its redirect page finishes the connection.
    const url = (data as { url?: string } | null)?.url;
    if (url) window.location.assign(url);
  };

  const unavailable = !clientId || client.isError;

  return (
    <Page title="Connect an agent" className="max-w-xl">
      <SettingsSection
        title={
          unavailable
            ? "This request isn't valid anymore"
            : `${name} wants to connect to Openinary`
        }
        description={
          unavailable
            ? "It may have expired. Start the connection again from your agent."
            : `It will be able to list, upload, move, rename and delete files in ${account}, as you. It never sees your API keys.`
        }
      >
        {client.isLoading && <Spinner className="size-4" />}
        {client.data && (
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={() => respond(true)}
            >
              {busy === "allow" ? "Connecting…" : "Allow"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => respond(false)}
            >
              Deny
            </Button>
          </div>
        )}
      </SettingsSection>
    </Page>
  );
}
