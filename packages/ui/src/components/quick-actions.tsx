"use client";

import { Command as CommandIcon, type LucideIcon } from "lucide-react";
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
  icon?: LucideIcon;
  onSelect: () => void;
};

/**
 * The sidebar's search-shaped button and the palette it opens (also on
 * Cmd/Ctrl+K): shadcn's command menu, one section per group the host app
 * gives its actions, fuzzy-filtered by cmdk.
 */
export function QuickActions({
  actions,
  className,
}: {
  actions: QuickAction[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Quick actions"
        className={cn(
          "flex h-7 w-full items-center gap-2 rounded-md border bg-background px-2 text-left text-sm text-muted-foreground shadow-xs outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30",
          "group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0",
          className,
        )}
      >
        <CommandIcon className="size-3.5 shrink-0" />
        <span className="flex-1 truncate group-data-[collapsible=icon]:hidden">
          Quick actions
        </span>
        <kbd className="font-sans text-xs group-data-[collapsible=icon]:hidden">
          K
        </kbd>
      </button>

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
