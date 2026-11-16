"use client";

import { type LucideIcon, Search } from "lucide-react";
import { Fragment, useEffect, useState } from "react";

import { cn } from "../lib/utils";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "../ui/command";

export type QuickAction = {
  label: string;
  /** Section heading in the palette; sections keep the order they first appear in. */
  group: string;
  icon?: LucideIcon | React.ComponentType<{ className?: string }>;
  onSelect: () => void;
};

const OPEN_EVENT = "openinary:quick-actions";

/** Opens the palette from any search affordance, wherever it is mounted. */
export function openQuickActions() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/**
 * The sidebar's search-shaped button and the palette it opens (also on
 * Cmd/Ctrl+K): shadcn's command menu, one section per group the host app
 * gives its actions, fuzzy-filtered by cmdk.
 */
export function QuickActions({
  actions,
  className,
  bare,
}: {
  actions: QuickAction[];
  className?: string;
  /** Only the palette: the host draws its own triggers (openQuickActions). */
  bare?: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  const groups = new Map<string, QuickAction[]>();
  for (const action of actions) {
    groups.set(action.group, [...(groups.get(action.group) ?? []), action]);
  }

  const run = (action: QuickAction) => {
    setOpen(false);
    action.onSelect();
  };

  return (
    <>
      {!bare && (
      <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Quick actions"
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-[8px] border border-ds-border bg-ds-field px-2.5 text-left text-[13.5px]/5 text-ds-faint outline-none transition-colors hover:text-ds-secondary focus-visible:outline-2 focus-visible:outline-ds-ring focus-visible:outline-offset-2",
            "group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0",
            className,
          )}
        >
          <Search className="size-3.5 shrink-0" strokeWidth={1.6} />
          <span className="flex-1 truncate group-data-[collapsible=icon]:hidden">
            Search
          </span>
          <kbd className="rounded-[5px] border border-ds-border-hover px-1.25 py-px font-sans text-[11px]/3.5 text-ds-muted group-data-[collapsible=icon]:hidden">
            ⌘K
          </kbd>
        </button>
      )}

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Quick actions"
        description="Search for a page, a tool or an action"
        className="max-w-md"
      >
        <Command>
          <CommandInput placeholder="Type a command or search..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            {[...groups].map(([heading, items], index) => (
              <Fragment key={heading}>
                {index > 0 && <CommandSeparator />}
                <CommandGroup heading={heading}>
                  {items.map((action) => (
                    <CommandItem
                      key={action.label}
                      value={action.label}
                      onSelect={() => run(action)}
                    >
                      {action.icon && <action.icon />}
                      <span className="truncate">{action.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Fragment>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
