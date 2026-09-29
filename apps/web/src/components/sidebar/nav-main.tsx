"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export interface NavItem {
  title: string;
  icon: LucideIcon;
  /** A route, or an absolute URL that opens in a new tab. */
  url?: string;
  /** For entries that open something in place, like a settings tab. */
  onSelect?: () => void;
  /** Gradient classes: the icon sits in a coloured tile instead of bare. */
  tile?: string;
}

export function NavMain({ label, items }: { label?: string; items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <SidebarGroup>
      {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarMenu>
        {items.map((item) => {
          const icon = item.tile ? (
            <span
              className={cn(
                "inset-ring-1 inset-ring-black/10 -mx-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-linear-to-br text-white",
                item.tile,
              )}
            >
              <item.icon className="size-3" />
            </span>
          ) : (
            <item.icon />
          );
          const external = item.url?.startsWith("http");

          return (
            <SidebarMenuItem key={item.title}>
              {item.url ? (
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                  isActive={pathname === item.url}
                  className={cn(item.tile && "group-data-[collapsible=icon]:p-1.5!")}
                >
                  <Link
                    href={item.url}
                    {...(external && { target: "_blank", rel: "noreferrer" })}
                  >
                    {icon}
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              ) : (
                <SidebarMenuButton
                  tooltip={item.title}
                  onClick={item.onSelect}
                  className={cn(item.tile && "group-data-[collapsible=icon]:p-1.5!")}
                >
                  {icon}
                  <span>{item.title}</span>
                </SidebarMenuButton>
              )}
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
