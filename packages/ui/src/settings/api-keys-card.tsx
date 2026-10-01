"use client";

import { ChevronDown, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import { CopyInput } from "../ui/copy-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Skeleton } from "../ui/skeleton";
import { SettingsFields } from "./settings-section";

export type ApiKeyItem = {
  id: string;
  name: string | null;
  start: string | null;
  enabled: boolean;
  createdAt: string | Date;
  expiresAt: string | Date | null;
  lastRequest: string | Date | null;
  /** Chips in the middle column: what the key is allowed to reach. */
  scopes?: React.ReactNode[];
  /** Facts shown in the expanded row, after the ones every key has. */
  details?: { label: string; value: React.ReactNode }[];
};

const STALE_DAYS = 30;
const DAY = 86_400_000;

// The dashboard is in English, so the dates are too, whatever the browser.
const shortDate = (date: Date) =>
  date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const dateTime = (date: Date) =>
  date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
const UNITS = [
  ["year", 365 * DAY],
  ["month", 30 * DAY],
  ["day", DAY],
  ["hour", 3_600_000],
  ["minute", 60_000],
] as const;
function ago(date: Date) {
  const diff = date.getTime() - Date.now();
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return "just now";
}

const toDate = (value: string | Date | null) =>
  value === null ? null : new Date(value);

function StatusBadge({ status }: { status: "active" | "disabled" | "expired" }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-md border px-1.5 text-xs font-medium",
        status === "active" &&
          "border-emerald-600/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        status === "disabled" && "bg-muted text-muted-foreground",
        status === "expired" &&
          "border-destructive/20 bg-destructive/10 text-destructive",
      )}
    >
      {status === "active"
        ? "Active"
        : status === "disabled"
          ? "Disabled"
          : "Expired"}
    </span>
  );
}

/** A chip for the scopes column. */
export function ApiKeyScope({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-full items-center truncate rounded-md border bg-background px-2 font-mono text-xs",
        className,
      )}
      {...props}
    />
  );
}

/**
 * A destructive action that has to be held down, not clicked: revoking a key
 * breaks whatever uses it, and holding is harder to do by accident than
 * confirming a dialog out of habit. Works with Space and Enter too.
 */
function HoldToConfirm({
  onConfirm,
  duration = 1200,
  children,
}: {
  onConfirm: () => void;
  duration?: number;
  children: React.ReactNode;
}) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const start = () => {
    if (timer.current !== undefined) return;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      setHolding(false);
      onConfirm();
    }, duration);
  };
  const cancel = () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    setHolding(false);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onKeyDown={(event) => {
        if ((event.key === " " || event.key === "Enter") && !event.repeat) {
          event.preventDefault();
          start();
        }
      }}
      onKeyUp={cancel}
      onBlur={cancel}
      onContextMenu={(event) => event.preventDefault()}
      className="relative inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 overflow-hidden rounded-lg border border-destructive/40 bg-background px-3 text-sm font-medium text-destructive outline-none select-none focus-visible:ring-[3px] focus-visible:ring-destructive/20 [&_svg]:size-4"
    >
      <span
        aria-hidden
        className="absolute inset-0 origin-left bg-destructive/15"
        style={{
          transform: `scaleX(${holding ? 1 : 0})`,
          transition: `transform ${holding ? duration : 150}ms ${holding ? "linear" : "ease-out"}`,
        }}
      />
      <span className="relative inline-flex items-center gap-1.5">
        {children}
      </span>
    </button>
  );
}

function ApiKeyRow({
  apiKey,
  onToggle,
  onRevoke,
}: {
  apiKey: ApiKeyItem;
  onToggle: (key: ApiKeyItem) => Promise<unknown>;
  onRevoke: (key: ApiKeyItem) => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const created = new Date(apiKey.createdAt);
  const expires = toDate(apiKey.expiresAt);
  const lastRequest = toDate(apiKey.lastRequest);
  const expired = !!expires && expires.getTime() < Date.now();
  const stale =
    !!lastRequest && Date.now() - lastRequest.getTime() > STALE_DAYS * DAY;
  const facts = [
    {
      label: "Last request",
      value: lastRequest ? dateTime(lastRequest) : "Never",
    },
    {
      label: expired ? "Expired" : "Expires",
      value: expires ? shortDate(expires) : "Never",
    },
    ...(apiKey.details ?? []),
  ];

  return (
    <details className="group open:bg-muted/40">
      {/* One row of four columns when there's room, stacked when not. */}
      <summary className="grid cursor-pointer list-none items-center gap-x-6 gap-y-2 px-5 py-3.5 outline-none [grid-template-areas:'name_chevron'_'scopes_scopes'_'meta_meta'] grid-cols-[minmax(0,1fr)_auto] focus-visible:bg-muted/40 @xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,11rem)_auto] @xl:[grid-template-areas:'name_scopes_meta_chevron'] [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 [grid-area:name]">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">
              {apiKey.name ?? "Unnamed key"}
            </span>
            <StatusBadge
              status={
                expired ? "expired" : apiKey.enabled ? "active" : "disabled"
              }
            />
          </div>
          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
            {apiKey.start ? `${apiKey.start}••••••••` : "••••••••"}
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap gap-1 [grid-area:scopes] empty:hidden">
          {apiKey.scopes}
        </div>
        <div className="min-w-0 text-[13px] text-muted-foreground [grid-area:meta]">
          <p className="flex items-center gap-1.5 truncate">
            {stale && (
              <TriangleAlert
                className="size-3.5 shrink-0 text-amber-600 dark:text-amber-500"
                aria-label={`Unused for over ${STALE_DAYS} days`}
              />
            )}
            {lastRequest ? `Used ${ago(lastRequest)}` : "Never used"}
          </p>
          <p className="mt-0.5 truncate">Created {shortDate(created)}</p>
        </div>
        <ChevronDown className="size-4 text-muted-foreground transition-transform [grid-area:chevron] group-open:rotate-180" />
      </summary>

      <div className="px-5 pb-4">
        <dl className="grid gap-4 pt-1 pb-4 @md:grid-cols-3">
          {facts.map((fact) => (
            <div key={fact.label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{fact.label}</dt>
              <dd className="mt-1 truncate text-sm">{fact.value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-[13px] text-muted-foreground">
            Requests signed with this key fail as soon as it is revoked.
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => run(() => onToggle(apiKey))}
            >
              {apiKey.enabled ? "Disable" : "Enable"}
            </Button>
            <HoldToConfirm onConfirm={() => run(() => onRevoke(apiKey))}>
              <Trash2 />
              Hold to revoke
            </HoldToConfirm>
          </div>
        </div>
      </div>
    </details>
  );
}

/**
 * Every key in one card: a count and the way to make another on top, then a
 * row per key that opens onto its details and the controls that end it.
 */
export function ApiKeysCard({
  keys,
  isLoading,
  error,
  onCreate,
  onToggle,
  onRevoke,
}: {
  keys: ApiKeyItem[] | undefined;
  isLoading?: boolean;
  error?: string | null;
  onCreate: () => void;
  onToggle: (key: ApiKeyItem) => Promise<unknown>;
  onRevoke: (key: ApiKeyItem) => Promise<unknown>;
}) {
  const active =
    keys?.filter(
      (key) =>
        key.enabled &&
        (!key.expiresAt || new Date(key.expiresAt).getTime() > Date.now()),
    ).length ?? 0;

  return (
    <div className="@container overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-4 px-5 py-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">
            {active}
          </span>{" "}
          active {active === 1 ? "key" : "keys"}
        </p>
        <Button size="sm" onClick={onCreate}>
          <Plus />
          Create key
        </Button>
      </div>
      <div className="divide-y border-t">
        {isLoading ? (
          [0, 1].map((i) => (
            <div key={i} className="space-y-2 px-5 py-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))
        ) : error ? (
          <p className="px-5 py-8 text-center text-sm text-destructive">
            {error}
          </p>
        ) : !keys?.length ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-medium">No keys yet</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Create one to call the API from your servers.
            </p>
          </div>
        ) : (
          keys.map((key) => (
            <ApiKeyRow
              key={key.id}
              apiKey={key}
              onToggle={onToggle}
              onRevoke={onRevoke}
            />
          ))
        )}
      </div>
    </div>
  );
}

/**
 * The form for a new key, then, once it exists, the key itself: the only
 * time it can be read. The host app brings the fields.
 */
export function CreateApiKeyDialog({
  open,
  onOpenChange,
  description,
  createdKey,
  pending,
  onSubmit,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  description?: React.ReactNode;
  createdKey: string | null;
  pending?: boolean;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  const footer =
    "-mx-4 -mb-4 flex-row justify-end gap-2 rounded-b-lg border-t bg-muted/50 p-4";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {createdKey ? (
          <>
            <DialogHeader>
              <DialogTitle>Save your key</DialogTitle>
              <DialogDescription>
                Copy it now and keep it somewhere safe. It won't be shown
                again.
              </DialogDescription>
            </DialogHeader>
            <CopyInput value={createdKey} />
            <DialogFooter className={footer}>
              <Button size="sm" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="@container grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            <DialogHeader>
              <DialogTitle>Create a key</DialogTitle>
              {description && (
                <DialogDescription>{description}</DialogDescription>
              )}
            </DialogHeader>
            <SettingsFields>{children}</SettingsFields>
            <DialogFooter className={footer}>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Creating..." : "Create key"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
