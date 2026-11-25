"use client";

import {
  Badge,
  DefaultDialog,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsField,
  SettingsFields,
  SettingsList,
  SettingsSection,
  Spinner,
} from "@openinary/ui";
import { initials } from "@openinary/dashboard";
import { Button } from "@openinary/dashboard/ui/button";
import { Input } from "@openinary/dashboard/ui/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, RotateCcw, Trash2, UserPlus } from "lucide-react";
import { useRef, useState } from "react";
import { ROLES, type Role } from "shared/permissions";
import { Skeleton } from "skullet/react";
import { toast } from "sonner";

import { authClient, useRole, useSession } from "@/lib/auth-client";
import { describeAuthError } from "@/lib/auth-errors";
import { PASSWORD_ONLY, type AuthOptions } from "@/lib/validate-auth-config";

const USERS_KEY = ["openinary", "admin", "users"] as const;

const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

const ROLE_HINT: Record<Role, string> = {
  admin: "Everything, including users and instance settings.",
  member: "Upload, organise and delete media; their own API keys.",
  viewer: "Browse and download media. Nothing else.",
};

interface UserRow {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role?: string | null;
  banned?: boolean | null;
  createdAt: Date | string;
}

// Drawn under the skeleton while the list loads: same rows, sample values.
const SAMPLE_USERS: UserRow[] = [1, 2, 3].map((i) => ({
  id: `sample-${i}`,
  name: "Sample person",
  email: "person@example.com",
  role: "member",
  banned: false,
  createdAt: new Date(0),
}));

/** Every account, oldest first. One instance rarely has more than a team. */
function useUsers(enabled: boolean) {
  return useQuery({
    queryKey: USERS_KEY,
    enabled,
    queryFn: async (): Promise<UserRow[]> => {
      const result = await authClient.admin.listUsers({
        query: { limit: 1000, sortBy: "createdAt", sortDirection: "asc" },
      });
      if (result.error) {
        throw new Error(
          describeAuthError(result.error, "Failed to load users", { context: "admin" }),
        );
      }
      return result.data.users as UserRow[];
    },
  });
}

/** Whether the Add user form asks for a password (SSO-only instances don't). */
function useAuthOptions() {
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

/**
 * Better Auth answers with `{ error }` instead of throwing; this throws it,
 * worded for the admin doing it rather than the account it's done to.
 */
async function unwrap<T extends { error: { code?: string; message?: string } | null }>(
  promise: Promise<T>,
  fallback: string,
): Promise<T> {
  const result = await promise;
  if (result.error) {
    throw new Error(describeAuthError(result.error, fallback, { context: "admin" }));
  }
  return result;
}

const message = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

function RoleSelect({
  value,
  onChange,
  disabled,
  className,
  container,
  onOpenChange,
}: {
  value: Role;
  onChange: (role: Role) => void;
  disabled?: boolean;
  className?: string;
  container?: React.RefObject<HTMLElement | null>;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Select
      items={ROLE_LABEL}
      value={value}
      onValueChange={(next) => onChange(next as Role)}
      onOpenChange={onOpenChange}
      disabled={disabled}
    >
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent container={container} alignItemWithTrigger={!container}>
        {ROLES.map((role) => (
          <SelectItem key={role} value={role}>
            {ROLE_LABEL[role]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AddUserDialog({
  open,
  onOpenChange,
  passwordLogin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  passwordLogin: boolean;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("member");
  // The role menu renders inside the dialog (see SelectContent), below the
  // trigger: the dialog's transform throws off the trigger-aligned placement.
  const form = useRef<HTMLFormElement>(null);
  // Whether that menu is open: Escape then closes the menu, not the dialog
  // (and the fields typed so far). A ref, read in the same keypress.
  const roleMenuOpen = useRef(false);

  const create = useMutation({
    mutationFn: () =>
      unwrap(
        authClient.admin.createUser({
          name: name.trim(),
          email: email.trim(),
          // No password: an account that can only sign in with SSO, which
          // Better Auth links to by email on their first sign-in.
          ...(passwordLogin ? { password } : {}),
          role,
        }),
        "Couldn't add this user",
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });

  const close = () => {
    onOpenChange(false);
    setName("");
    setEmail("");
    setPassword("");
    setRole("member");
    roleMenuOpen.current = false;
    create.reset();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await create.mutateAsync();
      toast.success(`${name.trim() || email.trim()} can now sign in`);
      close();
    } catch (error) {
      toast.error(message(error, "Couldn't add this user"));
    }
  };

  const valid =
    !!name.trim() && !!email.trim() && (!passwordLogin || password.length >= 8);

  return (
    <DefaultDialog
      title="Add user"
      isOpen={open}
      contentClassName="max-w-[440px]"
      onClose={() => {
        if (!create.isPending) close();
      }}
      onEscapeKeyDown={(event) => {
        if (roleMenuOpen.current) event.preventDefault();
      }}
    >
      <form ref={form} onSubmit={handleSubmit} className="space-y-4">
        <SettingsFields>
          <SettingsField label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ada Lovelace"
              autoComplete="off"
            />
          </SettingsField>
          <SettingsField label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ada@example.com"
              autoComplete="off"
            />
          </SettingsField>
        </SettingsFields>
        {passwordLogin ? (
          <SettingsField
            label="Password"
            hint="At least 8 characters. Share it with them however you share secrets; they can change it later."
          >
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </SettingsField>
        ) : (
          <p className="text-[12.5px]/[18px] text-ds-faint">
            Password sign-in is off, so they'll sign in with single sign-on
            using this email address.
          </p>
        )}
        <SettingsField label="Role" hint={ROLE_HINT[role]}>
          <RoleSelect
            value={role}
            onChange={setRole}
            className="w-40"
            container={form}
            onOpenChange={(next) => {
              roleMenuOpen.current = next;
            }}
          />
        </SettingsField>
        <div className="-mx-4 -mb-4 flex flex-row justify-end gap-2 rounded-b-lg border-t bg-muted/50 px-4 py-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={create.isPending}
            onClick={close}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!valid || create.isPending}>
            {create.isPending ? <Spinner size={16} /> : "Add user"}
          </Button>
        </div>
      </form>
    </DefaultDialog>
  );
}

/**
 * Admin only (the settings list hides it from everyone else, and Better
 * Auth's admin routes refuse them): who has an account here, with what role.
 * Nobody can change their own role, suspend or remove themselves, so an
 * instance can't be left without the admin who did it.
 */
export function UsersTab() {
  const queryClient = useQueryClient();
  const role = useRole();
  const me = useSession().data?.user;
  const isAdmin = role === "admin";
  const users = useUsers(isAdmin);
  const passwordLogin = (useAuthOptions() ?? PASSWORD_ONLY).passwordLogin;

  const [adding, setAdding] = useState(false);
  const [toRemove, setToRemove] = useState<UserRow | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: USERS_KEY });

  const setUserRole = useMutation({
    mutationFn: (input: { userId: string; role: Role }) =>
      unwrap(authClient.admin.setRole(input), "Couldn't change the role"),
    onSuccess: refresh,
  });
  const ban = useMutation({
    mutationFn: (userId: string) =>
      unwrap(authClient.admin.banUser({ userId }), "Couldn't suspend this user"),
    onSuccess: refresh,
  });
  const unban = useMutation({
    mutationFn: (userId: string) =>
      unwrap(authClient.admin.unbanUser({ userId }), "Couldn't restore this user"),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (userId: string) =>
      unwrap(authClient.admin.removeUser({ userId }), "Couldn't remove this user"),
    onSuccess: refresh,
  });

  const handleRemove = async () => {
    if (!toRemove) return;
    try {
      await remove.mutateAsync(toRemove.id);
      toast.success(`${toRemove.name || toRemove.email} no longer has access`);
      setToRemove(null);
    } catch (error) {
      toast.error(message(error, "Couldn't remove this user"));
    }
  };

  const loading = !isAdmin || users.isLoading;
  const rows = loading ? SAMPLE_USERS : (users.data ?? []);

  return (
    <div className="space-y-6">
      <SettingsSection
        title="Users"
        description="Everyone with an account on this instance. Change what someone can do, suspend them, or remove their access."
        action={
          <Button size="sm" onClick={() => setAdding(true)} disabled={!isAdmin}>
            <UserPlus className="size-4" />
            Add user
          </Button>
        }
      >
        <Skeleton loading={loading} label="Loading users">
          {users.isError ? (
            <p className="text-destructive text-sm">
              {message(users.error, "Failed to load users.")}
            </p>
          ) : (
            <SettingsList>
              {rows.map((person) => {
                const isMe = person.id === me?.id;
                const label = person.name || person.email;
                const personRole: Role =
                  person.role === "admin" || person.role === "viewer"
                    ? person.role
                    : "member";
                const banned = !!person.banned;
                return (
                  <div
                    key={person.id}
                    className="flex min-h-12 flex-wrap items-center gap-3 px-4 py-2.5 text-sm"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[11px] font-medium">
                      {person.image ? (
                        <img src={person.image} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
                      ) : (
                        initials(label)
                      )}
                    </span>
                    <div className="min-w-[min(100%,12rem)] flex-1">
                      <p className="flex items-center gap-2 truncate font-medium">
                        <span className="truncate">
                          {label}
                          {isMe && (
                            <span className="text-muted-foreground"> (you)</span>
                          )}
                        </span>
                        {banned && <Badge variant="destructive">Suspended</Badge>}
                      </p>
                      <p className="truncate text-[13px] text-muted-foreground">
                        {person.email} · Joined{" "}
                        {new Date(person.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    {isMe ? (
                      <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground text-xs">
                        {ROLE_LABEL[personRole]}
                      </span>
                    ) : (
                      <div className="flex shrink-0 items-center gap-1">
                        <RoleSelect
                          value={personRole}
                          className="h-8 w-28 text-xs"
                          disabled={setUserRole.isPending}
                          onChange={(next) =>
                            setUserRole
                              .mutateAsync({ userId: person.id, role: next })
                              .then(() =>
                                toast.success(`${label} is now ${ROLE_LABEL[next].toLowerCase()}`),
                              )
                              .catch((error) =>
                                toast.error(message(error, "Couldn't change the role")),
                              )
                          }
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          disabled={ban.isPending || unban.isPending}
                          onClick={() =>
                            (banned ? unban : ban)
                              .mutateAsync(person.id)
                              .then(() =>
                                toast.success(
                                  banned
                                    ? `${label} can sign in again`
                                    : `${label} is suspended and signed out`,
                                ),
                              )
                              .catch((error) =>
                                toast.error(
                                  message(
                                    error,
                                    banned
                                      ? "Couldn't restore this user"
                                      : "Couldn't suspend this user",
                                  ),
                                ),
                              )
                          }
                        >
                          {banned ? (
                            <>
                              <RotateCcw className="size-3.5" />
                              Restore
                            </>
                          ) : (
                            <>
                              <Ban className="size-3.5" />
                              Suspend
                            </>
                          )}
                        </Button>
                        <button
                          type="button"
                          onClick={() => setToRemove(person)}
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`Remove ${label}`}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </SettingsList>
          )}
        </Skeleton>
      </SettingsSection>

      <AddUserDialog
        open={adding}
        onOpenChange={setAdding}
        passwordLogin={passwordLogin}
      />

      {toRemove && (
        <DefaultDialog
          title={`Remove ${toRemove.name || toRemove.email}?`}
          isOpen
          contentClassName="max-w-[384px]"
          onClose={() => {
            if (!remove.isPending) setToRemove(null);
          }}
        >
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Their account is deleted and they're signed out at once; their API
              keys stop working. Files they uploaded stay on this instance.
              To keep the account but block it, suspend it instead.
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
