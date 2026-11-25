"use client";

import {
  ImagePicker,
  SettingsActions,
  SettingsFields,
  SettingsSection,
  settingsFieldClass,
  settingsFieldLabelClass,
  Spinner,
  useOpeninary,
} from "@openinary/ui";
import { WorkspaceTile } from "@openinary/dashboard";
import { Button } from "@openinary/dashboard/ui/button";
import { Input } from "@openinary/dashboard/ui/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Skeleton } from "skullet/react";
import { toast } from "sonner";

import {
  type OnboardingState,
  useOnboardingState,
} from "@/components/onboarding-gate";

type Workspace = NonNullable<OnboardingState["workspace"]>;

/** Same limit as the API, which trims and refuses an empty name. */
const NAME_MAX = 60;

/**
 * The instance's name and logo, shown to everyone in the sidebar. Only admins
 * (settings:manage) see this page; the API enforces it too.
 */
export function WorkspaceTab() {
  const state = useOnboardingState();
  const workspace = state.data?.workspace ?? null;

  // The form takes its defaults at mount, so it is remounted (key) once the
  // saved workspace is known, as the account page does.
  return (
    <Skeleton loading={!state.data} label="Loading the workspace">
      <WorkspaceForm
        key={state.data ? "loaded" : "sample"}
        saved={workspace ?? { name: state.data ? "" : "Openinary", logo: null }}
      />
    </Skeleton>
  );
}

function WorkspaceForm({ saved }: { saved: Workspace }) {
  const { apiBaseUrl, fetch } = useOpeninary();
  const queryClient = useQueryClient();
  const [name, setName] = useState(saved.name);
  const [logo, setLogo] = useState<string | null>(saved.logo);
  const [tried, setTried] = useState(false);

  const save = useMutation({
    mutationFn: async (next: Workspace): Promise<Workspace> => {
      const res = await fetch(`${apiBaseUrl}/onboarding/workspace`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message || body?.error || "Could not save the workspace");
      return body.workspace as Workspace;
    },
    onSuccess: (workspace) => {
      // The sidebar reads the workspace from this query.
      queryClient.setQueryData<OnboardingState>(
        ["openinary", "onboarding-state", apiBaseUrl],
        (current) => current && { ...current, workspace },
      );
      void queryClient.invalidateQueries({
        queryKey: ["openinary", "onboarding-state", apiBaseUrl],
      });
      setName(workspace.name);
      setLogo(workspace.logo);
      setTried(false);
    },
  });

  const trimmed = name.trim();
  const invalid = tried && !trimmed;
  const dirty = trimmed !== saved.name || logo !== saved.logo;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!trimmed) {
          setTried(true);
          return;
        }
        toast.promise(save.mutateAsync({ name: trimmed, logo }), {
          loading: "Saving the workspace...",
          success: "Workspace updated",
          error: (error) =>
            error instanceof Error ? error.message : "Could not save the workspace",
        });
      }}
    >
      <SettingsSection
        title="Workspace"
        description="How this instance appears in the sidebar, for everyone who signs in."
      >
        <SettingsFields className="@sm:grid-cols-1">
          <div className={settingsFieldClass}>
            <label htmlFor="workspace-logo" className={`block ${settingsFieldLabelClass}`}>
              Logo
            </label>
            <ImagePicker
              id="workspace-logo"
              value={logo}
              onChange={setLogo}
              disabled={save.isPending}
              placeholder={
                <WorkspaceTile
                  name={trimmed || "Openinary"}
                  className="size-full text-[13px]/4"
                />
              }
            />
          </div>
          <div className={settingsFieldClass}>
            <label htmlFor="workspace-name" className={`block ${settingsFieldLabelClass}`}>
              Name
            </label>
            <Input
              id="workspace-name"
              maxLength={NAME_MAX}
              placeholder="Acme"
              value={name}
              aria-invalid={invalid || undefined}
              onChange={(e) => setName(e.target.value)}
            />
            {invalid && (
              <p role="alert" className="text-[12.5px]/[18px] text-ds-red">
                Give the workspace a name.
              </p>
            )}
          </div>
        </SettingsFields>
        <SettingsActions>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={save.isPending || !dirty}
            onClick={() => {
              setName(saved.name);
              setLogo(saved.logo);
              setTried(false);
            }}
          >
            Reset
          </Button>
          <Button
            type="submit"
            size="sm"
            className="w-[110px]"
            disabled={save.isPending || !dirty}
          >
            {save.isPending ? <Spinner size={16} /> : "Save Changes"}
          </Button>
        </SettingsActions>
      </SettingsSection>
    </form>
  );
}
