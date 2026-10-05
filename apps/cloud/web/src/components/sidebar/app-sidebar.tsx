"use client";

import { type MediaFile, type QuickAction, QuickActions } from "@openinary/ui";
import {
  BookOpen,
  Boxes,
  ChartColumn,
  Image as ImageIcon,
  KeyRound,
  LayoutGrid,
  Palette,
  Plug,
  ScrollText,
  Upload,
  UploadCloud,
  Video,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { FILE_UPLOADER_DOCS } from "@/components/get-started/uploader-card";
import { useSettingsPage } from "@/components/settings/use-settings-page";
import { BucketSwitcher } from "@/components/sidebar/bucket-switcher";
import { type NavItem, NavMain } from "@/components/sidebar/nav-main";
import { NavSettings } from "@/components/sidebar/nav-plan";
import { NavProjects } from "@/components/sidebar/nav-projects";
import { UpgradeCard } from "@/components/sidebar/upgrade-card";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  onMediaSelect?: (media: MediaFile) => void;
}

export function AppSidebar({ onMediaSelect, ...props }: AppSidebarProps) {
  const router = useRouter();
  const setSettingsTab = useSettingsPage();

  const mainItems: NavItem[] = [
    { title: "Assets", icon: LayoutGrid, url: "/" },
    { title: "Usage", icon: ChartColumn, url: "/settings/billing" },
    { title: "Logs", icon: ScrollText, url: "/settings/logs" },
    { title: "API keys", icon: KeyRound, url: "/settings/api-keys" },
  ];

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
      url: FILE_UPLOADER_DOCS,
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
    {
      label: "Manage buckets",
      group: "Settings",
      icon: Boxes,
      onSelect: () => setSettingsTab("buckets"),
    },
    {
      label: "Appearance",
      group: "Settings",
      icon: Palette,
      onSelect: () => setSettingsTab("appearance"),
    },
    {
      label: "Documentation",
      group: "Help",
      icon: BookOpen,
      onSelect: () =>
        window.open("https://docs.openinary.dev", "_blank", "noreferrer"),
    },
  ];

  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col">
          <BucketSwitcher />
          <SidebarTrigger className="text-muted-foreground" />
        </div>
        <QuickActions actions={quickActions} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={mainItems} />
        <NavMain label="Tools" items={toolItems} />
        <NavProjects onMediaSelect={onMediaSelect} />
      </SidebarContent>
      <SidebarFooter className="p-0 group-data-[collapsible=icon]:px-0">
        <div className="px-3 empty:hidden group-data-[collapsible=icon]:hidden">
          <UpgradeCard />
        </div>
        <div className="border-t px-3 py-2 group-data-[collapsible=icon]:px-2">
          <NavSettings />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
