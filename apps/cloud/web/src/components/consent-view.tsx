"use client";

import { PageHeader, Sheet, useDocumentTitle } from "@openinary/dashboard";
import { Button } from "@openinary/dashboard/ui/button";
import { Spinner } from "@openinary/ui";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
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
 * keeps that account even if they switch later. Same layout as Cloud's Home,
 * which is where this flow started.
 */
export function ConsentView() {
  const [busy, setBusy] = useState<"allow" | "deny" | null>(null);
  const [answered, setAnswered] = useState<"allowed" | "denied" | null>(null);
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
  const account = activeTeam.data?.name ?? "your account";
  useDocumentTitle(`Connect ${name}`);

  const respond = async (accept: boolean) => {
    setBusy(accept ? "allow" : "deny");
    const { data, error } = await authClient.oauth2.consent({ accept });
    if (error) {
      toast.error(error.message ?? "Something went wrong");
      setBusy(null);
      return;
    }
    // Answered: say so here first. The redirect below hands the code to the
    // agent's local callback, and some agents answer it without a page of
    // their own, which leaves the browser on this one.
    setAnswered(accept ? "allowed" : "denied");
    const url = (data as { url?: string } | null)?.url;
    if (url) window.location.assign(url);
  };

  const unavailable = !clientId || client.isError;

  return (
    <Sheet>
      <PageHeader />
      <div className="@container/main min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="flex justify-center px-4 pt-16 pb-12 sm:px-8 md:pt-32">
          <div className="flex w-full max-w-[560px] flex-col">
            {answered === "allowed" ? (
              <>
                <p className="mb-2.5 flex items-center gap-2 font-medium text-[13px]/5 text-ds-green">
                  <span className="size-[7px] rounded-full bg-ds-green shadow-[0_0_0_3px_rgb(21_128_61/0.15)]" />
                  Connected to {account}
                </p>
                <h1 className="font-semibold text-[28px]/9 tracking-[-0.01em]">
                  {name} is connected.
                  <br />
                  <span className="font-medium text-ds-muted">
                    Head back to your editor.
                  </span>
                </h1>
                <p className="mt-3.5 text-pretty text-[14px]/5 text-ds-muted">
                  You can close this tab. Your agent can now set Openinary up in
                  your project, and you'll find it on Home, where you can
                  disconnect it whenever you want.
                </p>
                <div className="mt-7">
                  <Button asChild variant="outline">
                    <Link href="/get-started">Go to Home</Link>
                  </Button>
                </div>
              </>
            ) : answered === "denied" ? (
              <>
                <p className="mb-2.5 text-[13px]/5 text-ds-muted">
                  Connect an agent
                </p>
                <h1 className="font-semibold text-[28px]/9 tracking-[-0.01em]">
                  Denied.
                  <br />
                  <span className="font-medium text-ds-muted">
                    Nothing was shared with {name}.
                  </span>
                </h1>
                <p className="mt-3.5 text-pretty text-[14px]/5 text-ds-muted">
                  You can close this tab.
                </p>
              </>
            ) : client.isLoading ? (
              <Spinner className="size-4" />
            ) : unavailable ? (
              <>
                <p className="mb-2.5 text-[13px]/5 text-ds-muted">
                  Connect an agent
                </p>
                <h1 className="font-semibold text-[28px]/9 tracking-[-0.01em]">
                  This request expired.
                </h1>
                <p className="mt-3.5 text-pretty text-[14px]/5 text-ds-muted">
                  Start the connection again from your agent. It opens a fresh
                  one in your browser.
                </p>
              </>
            ) : (
              <>
                <p className="mb-2.5 text-[13px]/5 text-ds-muted">
                  Connect an agent
                </p>
                <h1 className="font-semibold text-[28px]/9 tracking-[-0.01em]">
                  {name}
                  <br />
                  <span className="font-medium text-ds-muted">
                    wants to connect to {account}.
                  </span>
                </h1>
                <p className="mt-3.5 text-pretty text-[14px]/5 text-ds-muted">
                  It will list, upload, move, rename and delete files there, as
                  you, and set Openinary up in your project. It never sees your
                  API keys, and you can disconnect it from Home at any time.
                </p>
                <div className="mt-7 flex items-center gap-2">
                  <Button
                    disabled={busy !== null}
                    onClick={() => respond(true)}
                  >
                    {busy === "allow" ? "Connecting…" : `Allow ${name}`}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => respond(false)}
                  >
                    Deny
                  </Button>
                </div>
                <p className="mt-8 border-t pt-5 text-[12.5px]/5 text-ds-faint">
                  Didn't start this from your editor? Deny it: nothing is
                  shared.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
