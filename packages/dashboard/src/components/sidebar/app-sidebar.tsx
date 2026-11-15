"use client";

import {
  openQuickActions,
  type QuickAction,
  QuickActions,
} from "@openinary/ui";
import { BookOpen, Search, Upload } from "lucide-react";

import { useDashboard } from "../../adapter";
import {
  SolarHome,
  SolarImages,
  SolarIntegrate,
  SolarSettings,
  SolarUploader,
  SolarVideos,
} from "../../ui/solar-icons";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarTrigger,
} from "../../ui/sidebar";
import { SetupGuide } from "../get-started/setup-guide";
import { type NavItem, NavMain } from "./nav-main";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  /** The product mark, beside its name at the top. */
  brand: React.ReactNode;
  /** After Home: the product's own pages. */
  mainItems: NavItem[];
  /** Listed under Settings while a settings page is open. */
  settingsPages: { title: string; url: string }[];
  /** Palette entries filed under "Settings". */
  settingsActions: QuickAction[];
  /** Above the account row: notices that belong to one product. */
  notices?: React.ReactNode;
  /** The workspace block and the account avatar (SidebarAccount). */
  account: React.ReactNode;
  /** The "Uploader" tool: a demo route, or the docs page. */
  uploaderHref: string;
}

const ICON_BUTTON =
  "flex size-7 cursor-pointer items-center justify-center rounded-[8px] text-ds-muted outline-none transition-colors hover:bg-ds-hover hover:text-ds-text focus-visible:outline-2 focus-visible:outline-ds-ring";

export function AppSidebar({
  brand,
  mainItems,
  settingsPages,
  settingsActions,
  notices,
  account,
  uploaderHref,
  ...props
}: AppSidebarProps) {
  const { Link, useRouter, docsUrl } = useDashboard();
  const router = useRouter();

  const startItems: NavItem[] = [
    { title: "Home", icon: SolarHome, url: "/get-started" },
    ...mainItems,
  ];
  const buildItems: NavItem[] = [
    { title: "Integrate", icon: SolarIntegrate, url: "/get-started/integrate" },
    { title: "Images", icon: SolarImages, url: "/get-started/images" },
    { title: "Videos", icon: SolarVideos, url: "/get-started/videos" },
    { title: "Uploader", icon: SolarUploader, url: uploaderHref },
  ];
  const workspaceItems: NavItem[] = [
    {
      title: "Settings",
      icon: SolarSettings,
      url: settingsPages[0]?.url ?? "/settings",
      children: settingsPages,
    },
  ];

  // One palette entry per sidebar link, filed under the section it sits in.
  const toAction =
    (group: string) =>
    (item: NavItem): QuickAction => ({
      label: item.title,
      group,
      icon: item.icon,
      onSelect:
        item.onSelect ??
        (() =>
          item.url?.startsWith("http")
            ? window.open(item.url, "_blank", "noreferrer")
            : router.push(item.url ?? "/")),
    });

  const quickActions: QuickAction[] = [
    {
      label: "Upload files",
      group: "Actions",
      icon: Upload,
      onSelect: () => router.push("/?upload=true"),
    },
    ...startItems.map(toAction("Pages")),
    ...buildItems.map(toAction("Build")),
    ...settingsActions,
    {
      label: "Documentation",
      group: "Help",
      icon: BookOpen,
      onSelect: () => window.open(docsUrl, "_blank", "noreferrer"),
    },
  ];

  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader>
        <div className="flex h-8 items-center gap-1 pr-0.5 pl-2.5 group-data-[collapsible=icon]:hidden">
          <Link
            href="/get-started"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-[6px] font-semibold text-[15px]/5 text-ds-text tracking-[-0.02em] outline-none focus-visible:outline-2 focus-visible:outline-ds-ring"
          >
            {brand}
            <span className="truncate">Openinary</span>
          </Link>
          <button
            type="button"
            aria-label="Search"
            onClick={openQuickActions}
            className={ICON_BUTTON}
          >
            <Search className="size-4" strokeWidth={1.6} />
          </button>
          <SidebarTrigger className={ICON_BUTTON} />
        </div>
        <SidebarTrigger className="hidden size-8 self-center text-ds-muted group-data-[collapsible=icon]:flex" />
      </SidebarHeader>
      <QuickActions bare actions={quickActions} />
      <SidebarContent className="pt-1">
        <NavMain items={startItems} />
        <div
          aria-hidden
          className="mx-3 my-1.5 h-px bg-ds-divider group-data-[collapsible=icon]:mx-2"
        />
        <NavMain label="Build" items={buildItems} />
        <NavMain label="Workspace" items={workspaceItems} />
      </SidebarContent>
      <SidebarFooter>
        <SetupGuide />
        {notices}
        {account}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
