"use client";

import { ChevronsUpDown } from "lucide-react";

import { useHydrated } from "../../hooks/use-hydrated";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";

// Dark tinted pairs, picked by a hash of the name so a workspace keeps its
// colour everywhere it is drawn.
const TILES = [
  "bg-[#1b2a45] text-[#93bbfd]",
  "bg-[#2a1f3d] text-[#c4b0fb]",
  "bg-[#123026] text-[#7fd9b0]",
  "bg-[#3a2410] text-[#f6c48a]",
  "bg-[#3a1820] text-[#f5a3b5]",
];

/** A workspace's mark: its first letter on a tinted square, or its logo. */
export function WorkspaceTile({
  name,
  logo,
  className = "size-8 rounded-[10px] text-[13px]/4",
}: {
  name: string;
  logo?: string | null;
  className?: string;
}) {
  if (logo) {
    return <img src={logo} alt="" className={`${className} object-cover`} />;
  }
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden
      className={`${className} flex shrink-0 items-center justify-center font-semibold ${TILES[hash % TILES.length]}`}
    >
      {name.trim().charAt(0).toUpperCase() || "O"}
    </span>
  );
}

const TRIGGER =
  "outline-none transition-colors hover:bg-ds-hover focus-visible:outline-2 focus-visible:outline-ds-ring data-[state=open]:bg-ds-hover";

/**
 * The bottom of the sidebar: the workspace (its tile, its name, a line about
 * it) opening the workspace menu, and the account avatar opening the account
 * menu. Both menus open upwards.
 */
export function SidebarAccount({
  tile,
  name,
  detail,
  workspaceMenu,
  avatar,
  accountMenu,
}: {
  tile: React.ReactNode;
  name: React.ReactNode;
  detail?: React.ReactNode;
  workspaceMenu: React.ReactNode;
  avatar: React.ReactNode;
  accountMenu: React.ReactNode;
}) {
  // What it shows comes from the session and the workspace, which only the
  // client knows: the server paints the row's space and nothing in it.
  if (!useHydrated()) return <div className="h-10" />;
  return (
    <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col">
      <DropdownMenu>
        <DropdownMenuTrigger
          className={`flex h-10 min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-[12px] p-1 text-left group-data-[collapsible=icon]:size-10 group-data-[collapsible=icon]:flex-none ${TRIGGER}`}
        >
          {tile}
          <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <span className="block truncate text-[14px]/[18px] text-ds-text">
              {name}
            </span>
            {detail && (
              <span className="block truncate text-[11.5px]/4 text-ds-muted">
                {detail}
              </span>
            )}
          </span>
          <ChevronsUpDown className="mr-1 size-3.5 shrink-0 text-ds-faint group-data-[collapsible=icon]:hidden" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          sideOffset={6}
          className="w-60"
        >
          {workspaceMenu}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Account"
          className={`flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-[10px] ${TRIGGER}`}
        >
          <span className="flex size-8 items-center justify-center overflow-hidden rounded-full bg-(--ds-avatar) font-medium text-[11px] text-ds-secondary">
            {avatar}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="end"
          sideOffset={6}
          className="min-w-56"
        >
          {accountMenu}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Up to two initials, for an avatar without a picture. */
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
