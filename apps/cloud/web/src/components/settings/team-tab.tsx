"use client";

import {
  DefaultDialog,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsActions,
  SettingsField,
  SettingsList,
  SettingsSection,
  Spinner,
} from "@openinary/ui";
import { initials } from "@openinary/dashboard";
import { Button } from "@openinary/dashboard/ui/button";
import { Input } from "@openinary/dashboard/ui/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Skeleton } from "skullet/react";
import { toast } from "sonner";

import { useSettingsPage } from "@/components/settings/use-settings-page";
import { useAccount } from "@/hooks/use-account";
import { authClient } from "@/lib/auth-client";
import { openSupport } from "@/components/support";
import { orpc } from "@/utils/orpc";

type InviteRole = "admin" | "member";

const ROLE_HINT: Record<InviteRole, string> = {
  admin: "Buckets, API keys and members. No billing.",
  member: "Upload, browse and delete media.",
};

const message = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

export function TeamTab() {
  const queryClient = useQueryClient();
  const setSettingsTab = useSettingsPage();
  const account = useAccount();
  const me = authClient.useSession().data?.user;
  const team = useQuery(orpc.team.members.queryOptions());
  const canManage = account.can("member.manage");

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("member");
  const [toRemove, setToRemove] = useState<{ id: string; label: string } | null>(
    null,
  );

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.team.members.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.team.overview.key() }),
    ]);

  const invite = useMutation(orpc.team.invite.mutationOptions());
  const setMemberRole = useMutation(
    orpc.team.setRole.mutationOptions({ onSuccess: refresh }),
  );
  const remove = useMutation(
    orpc.team.remove.mutationOptions({ onSuccess: refresh }),
  );
  const cancel = useMutation(
    orpc.team.cancelInvitation.mutationOptions({ onSuccess: refresh }),
  );

  const seats = team.data?.seats;
  const full = !!seats && seats.used >= seats.limit;

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    if (!address || full) return;
    try {
      await invite.mutateAsync({ email: address, role });
      setEmail("");
      await refresh();
      toast.success(`Invitation sent to ${address}`);
    } catch (error) {
      toast.error(message(error, "Couldn't send the invitation"));
    }
  };

  const handleRemove = async () => {
    if (!toRemove) return;
    try {
      await remove.mutateAsync({ memberId: toRemove.id });
      toast.success(`${toRemove.label} no longer has access`);
      setToRemove(null);
    } catch (error) {
      toast.error(message(error, "Couldn't remove this member"));
    }
  };

  return (
    <div className="space-y-6">
      {canManage && (
        <form onSubmit={handleInvite}>
          <SettingsSection
            title="Invite someone"
            description="They get an email with a link. Everyone on the team works in the same buckets, on this account's plan."
          >
            <SettingsField label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@company.com"
                disabled={full}
              />
            </SettingsField>
            <SettingsField label="Role" hint={ROLE_HINT[role]}>
              <Select
                value={role}
                onValueChange={(value) => setRole(value as InviteRole)}
                disabled={full}
              >
                <SelectTrigger className="w-40 capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </SettingsField>
            <Skeleton loading={!seats}>
              <p className="text-muted-foreground text-xs">
                {seats?.used ?? 1} of {seats?.limit ?? 3} seat
                {seats?.limit === 1 ? "" : "s"} used on your plan, invitations
                included.
                {/* Free (one seat) upgrades; a paid plan already has every
                    seat it can, so more is a chat with support for now. */}
                {full && seats.limit === 1 && account.can("billing") && (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="underline underline-offset-2 hover:text-foreground"
                      onClick={() => setSettingsTab("billing")}
                    >
                      Upgrade for more
                    </button>
                    .
                  </>
                )}
                {full && seats.limit > 1 && (
                  <>
                    {" "}
                    Need more?{" "}
                    <button
                      type="button"
                      className="underline underline-offset-2 hover:text-foreground"
                      onClick={openSupport}
                    >
                      Contact us
                    </button>
                    .
                  </>
                )}
              </p>
            </Skeleton>
            <SettingsActions>
              <Button
                type="submit"
                size="sm"
                disabled={invite.isPending || full || !email.trim()}
              >
                {invite.isPending ? "Sending…" : "Send invitation"}
              </Button>
            </SettingsActions>
          </SettingsSection>
        </form>
      )}

      <SettingsSection
        title="Members"
        description={
          canManage
            ? "Change what someone can do, or remove their access."
            : "The people who can use this account."
        }
      >
        <Skeleton id="team" loading={team.isLoading} label="Loading members">
          {team.isError ? (
            <p className="text-destructive text-sm">Failed to load members.</p>
          ) : (
            <SettingsList>
              {(team.data?.members ?? []).map((person) => {
                const isOwner = person.role === "owner";
                const isMe = person.userId === me?.id;
                const label = person.name || person.email;
                return (
                  <div
                    key={person.id ?? person.userId}
                    className="flex min-h-12 items-center gap-3 px-4 py-2.5 text-sm"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[11px] font-medium">
                      {person.image ? (
                        <img src={person.image} alt="" className="size-full object-cover" />
                      ) : (
                        initials(label)
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {label}
                        {isMe && (
                          <span className="text-muted-foreground"> (you)</span>
                        )}
                      </p>
                      <p className="truncate text-[13px] text-muted-foreground">
                        {person.email}
                      </p>
                    </div>
                    {canManage && !isOwner && !isMe && person.id ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <Select
                          value={person.role}
                          onValueChange={(value) =>
                            setMemberRole
                              .mutateAsync({
                                memberId: person.id as string,
                                role: value as InviteRole,
                              })
                              .catch((error) =>
                                toast.error(message(error, "Couldn't change the role")),
                              )
                          }
                        >
                          <SelectTrigger className="h-8 w-28 text-xs capitalize">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                        <button
                          type="button"
                          onClick={() =>
                            setToRemove({ id: person.id as string, label })
                          }
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`Remove ${label}`}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground text-xs capitalize">
                        {person.role}
                      </span>
                    )}
                  </div>
                );
              })}
            </SettingsList>
          )}
        </Skeleton>
      </SettingsSection>

      {canManage && (team.data?.invitations.length ?? 0) > 0 && (
        <SettingsSection
          title="Pending invitations"
          description="Each one holds a seat until it's accepted or it expires after 48 hours."
        >
          <SettingsList>
            {team.data?.invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex min-h-12 items-center gap-3 px-4 py-2.5 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{inv.email}</p>
                  <p className="truncate text-[13px] text-muted-foreground capitalize">
                    {inv.role ?? "member"} · expires{" "}
                    {new Date(inv.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs"
                  disabled={cancel.isPending}
                  onClick={() =>
                    cancel
                      .mutateAsync({ invitationId: inv.id })
                      .catch((error) =>
                        toast.error(message(error, "Couldn't cancel the invitation")),
                      )
                  }
                >
                  Cancel
                </Button>
              </div>
            ))}
          </SettingsList>
        </SettingsSection>
      )}

      {toRemove && (
        <DefaultDialog
          title={`Remove ${toRemove.label}?`}
          isOpen
          contentClassName="max-w-[384px]"
          onClose={() => {
            if (!remove.isPending) setToRemove(null);
          }}
        >
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              They lose access to this account on their next request. Files they
              uploaded and API keys they created stay with the account.
            </p>
            <div className="-mx-4 -mb-4 flex flex-row justify-end gap-2 rounded-b-lg border-t bg-muted/50 px-4 py-4">
              <Button
                variant="outline"
                size="sm"
                disabled={remove.isPending}
                onClick={() => setToRemove(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="w-[78px]"
                disabled={remove.isPending}
                onClick={handleRemove}
              >
                {remove.isPending ? <Spinner size={16} /> : "Remove"}
              </Button>
            </div>
          </div>
        </DefaultDialog>
      )}
    </div>
  );
}
