"use client";

import { Command, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "../lib/utils";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";

export type QuickAction = {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
};

/**
 * The sidebar's search-shaped button and the palette it opens (also on
 * Cmd/Ctrl+K). The list is whatever the host app passes in, filtered by
 * substring.
 */
// ponytail: substring match over a flat list. Swap for cmdk when the list
// needs groups, fuzzy ranking or async results.
export function QuickActions({
  actions,
  className,
}: {
  actions: QuickAction[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

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

  const matches = actions.filter((action) =>
    action.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    setQuery("");
    setActive(0);
  };

  const run = (action?: QuickAction) => {
    if (!action) return;
    handleOpenChange(false);
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
        <Command className="size-3.5 shrink-0" />
        <span className="flex-1 truncate group-data-[collapsible=icon]:hidden">
          Quick actions
        </span>
        <kbd className="font-sans text-xs group-data-[collapsible=icon]:hidden">
          K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="top-[20%] max-w-md translate-y-0 gap-0 overflow-hidden p-0 [&>button]:hidden">
          <DialogTitle className="sr-only">Quick actions</DialogTitle>
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((i) => Math.min(i + 1, matches.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                run(matches[active]);
              }
            }}
            placeholder="Search actions..."
            aria-label="Search actions"
            className="h-11 w-full border-b bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground"
          />
          <ul className="max-h-72 overflow-y-auto p-1.5">
            {matches.map((action, index) => (
              <li key={action.label}>
                <button
                  type="button"
                  onClick={() => run(action)}
                  onMouseMove={() => setActive(index)}
                  className={cn(
                    "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm [&>svg]:size-4 [&>svg]:text-muted-foreground",
                    index === active && "bg-accent text-accent-foreground",
                  )}
                >
                  {action.icon && <action.icon />}
                  <span className="truncate">{action.label}</span>
                </button>
              </li>
            ))}
            {matches.length === 0 && (
              <li className="px-2 py-6 text-center text-muted-foreground text-sm">
                No matching action
              </li>
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
