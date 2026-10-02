"use client";

import { type MediaFile, type QuickAction, QuickActions } from "@openinary/ui";
import {
  BookOpen,
  HardDrive,
  Image as ImageIcon,
  KeyRound,
  LayoutGrid,
  Palette,
  Plug,
  ScrollText,
  Settings,
  UploadCloud,
  User,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { GettingStarted } from "@/components/sidebar/getting-started";
import { type NavItem, NavMain } from "@/components/sidebar/nav-main";
import { NavProjects } from "@/components/sidebar/nav-projects";
import { NavUser } from "@/components/sidebar/nav-user";
import { useVersion } from "@/components/sidebar/version-display";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const GITHUB_URL = "https://github.com/openinary/openinary";
const DOCS_URL = "https://docs.openinary.dev";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  onMediaSelect?: (media: MediaFile) => void;
}

export function AppSidebar({ onMediaSelect, ...props }: AppSidebarProps) {
  const router = useRouter();
  const version = useVersion();
  const mainItems: NavItem[] = [
    { title: "Assets", icon: LayoutGrid, url: "/" },
    { title: "Logs", icon: ScrollText, url: "/settings/logs" },
    { title: "Storage", icon: HardDrive, url: "/settings/storage" },
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
      url: "/uploader-demo",
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
    ...mainItems.map(toAction("Pages")),
    ...toolItems.map(toAction("Tools")),
    {
      label: "Account",
      group: "Settings",
      icon: User,
      onSelect: () => router.push("/settings/account"),
    },
    {
      label: "Appearance",
      group: "Settings",
      icon: Palette,
      onSelect: () => router.push("/settings/appearance"),
    },
    {
      label: "Documentation",
      group: "Help",
      icon: BookOpen,
      onSelect: () => window.open(DOCS_URL, "_blank", "noreferrer"),
    },
  ];

  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col">
          <NavUser />
          <SidebarTrigger className="text-muted-foreground" />
        </div>
        <QuickActions actions={quickActions} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={mainItems} />
        <NavMain label="Tools" items={toolItems} />
        <NavProjects
          // Off the assets page there is no details panel to open, so go there.
          onMediaSelect={
            onMediaSelect ??
            ((media) =>
              router.push(`/?asset=${encodeURIComponent(media.id)}`))
          }
        />
      </SidebarContent>
      <SidebarFooter className="gap-0 p-0 group-data-[collapsible=icon]:px-0">
        <div className="px-3 pb-2 empty:hidden group-data-[collapsible=icon]:hidden">
          <GettingStarted />
        </div>
        <div className="border-t px-3 py-2 group-data-[collapsible=icon]:px-2">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <SidebarMenuButton
              asChild
              tooltip="Settings"
              className="min-w-0 flex-1 text-sidebar-foreground"
            >
              <Link href="/settings">
                <Settings />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
            {/* Still worth a glance when reporting a bug, so it stays, quietly. */}
            <a
              href={`${GITHUB_URL}/releases`}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 pr-1 text-xs text-muted-foreground tabular-nums transition-colors hover:text-foreground group-data-[collapsible=icon]:hidden"
            >
              {version}
            </a>
          </SidebarMenuItem>
        </SidebarMenu>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
