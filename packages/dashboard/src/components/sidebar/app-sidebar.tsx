"use client";

import { type QuickAction, QuickActions } from "@openinary/ui";
import {
  BookOpen,
  Image as ImageIcon,
  Plug,
  Upload,
  UploadCloud,
  Video,
} from "lucide-react";

import { useDashboard } from "../../adapter";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
  SidebarTrigger,
} from "../../ui/sidebar";
import { useOpenAsset } from "../shell";
import { type NavItem, NavMain } from "./nav-main";
import { NavProjects } from "./nav-projects";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  /** Who or what is signed in: the account menu, or the bucket switcher. */
  header: React.ReactNode;
  mainItems: NavItem[];
  /** Palette entries filed under "Settings". */
  settingsActions: QuickAction[];
  footer: React.ReactNode;
  /** The "Uploader" tool: a demo route, or the docs page. */
  uploaderHref: string;
}

export function AppSidebar({
  header,
  mainItems,
  settingsActions,
  footer,
  uploaderHref,
  ...props
}: AppSidebarProps) {
  const { useRouter, docsUrl } = useDashboard();
  const router = useRouter();
  const openAsset = useOpenAsset();

  const toolItems: NavItem[] = [
    {
      title: "Integrate",
      icon: Plug,
      url: "/get-started/integrate",
      tile: "from-orange-400 to-rose-500",
    },
    {
      title: "Images",
      icon: ImageIcon,
      url: "/get-started/images",
      tile: "from-sky-400 to-indigo-500",
    },
    {
      title: "Videos",
      icon: Video,
      url: "/get-started/videos",
      tile: "from-emerald-400 to-teal-600",
    },
    {
      title: "Uploader",
      icon: UploadCloud,
      url: uploaderHref,
      tile: "from-fuchsia-400 to-violet-600",
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
    ...mainItems.map(toAction("Pages")),
    ...toolItems.map(toAction("Tools")),
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
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col">
          {header}
          <SidebarTrigger className="text-muted-foreground" />
        </div>
        <QuickActions actions={quickActions} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={mainItems} />
        <NavMain label="Tools" items={toolItems} />
        <NavProjects onMediaSelect={openAsset} />
      </SidebarContent>
      {footer}
      <SidebarRail />
    </Sidebar>
  );
}
