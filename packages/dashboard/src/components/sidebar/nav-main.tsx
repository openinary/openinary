"use client";

import { cn } from "@openinary/ui/server";
import { useState } from "react";

import { useDashboard } from "../../adapter";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "../../ui/sidebar";

export interface NavItem {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  /** A route, or an absolute URL that opens in a new tab. */
  url?: string;
  /** For entries that open something in place. */
  onSelect?: () => void;
  /** Listed under the item, indented, while one of them is open. */
  children?: { title: string; url: string }[];
}

const ICON = "[&>svg]:size-[18px]";

/**
 * One group of sidebar rows. A labelled group folds from its label; folded
 * or not, a collapsed sidebar shows every row as an icon.
 */
export function NavMain({ label, items }: { label?: string; items: NavItem[] }) {
  const { Link, usePathname } = useDashboard();
  const pathname = usePathname();
  const collapsed = useSidebar().state === "collapsed";
  const [folded, setFolded] = useState(false);
  const showRows = collapsed || !folded;

  return (
    <SidebarGroup>
      {label && (
        <SidebarGroupLabel asChild>
          <button
            type="button"
            aria-expanded={!folded}
            onClick={() => setFolded(!folded)}
            className="w-fit cursor-pointer gap-1.5 hover:text-ds-secondary"
          >
            {label}
            <svg
              viewBox="0 0 8 8"
              aria-hidden
              className={cn(
                "size-[7px]! transition-transform duration-200",
                folded && "-rotate-90",
              )}
            >
              <path d="M0.5 2h7L4 6.5z" fill="currentColor" />
            </svg>
          </button>
        </SidebarGroupLabel>
      )}
      {showRows && (
        <SidebarMenu>
          {items.map((item) => {
            const external = item.url?.startsWith("http");
            const childActive = !!item.children?.some(
              (child) => child.url === pathname,
            );
            const showChildren = childActive && !collapsed;
            const active = pathname === item.url || childActive;
            const label = (
              <>
                <item.icon />
                <span>{item.title}</span>
              </>
            );

            return (
              <SidebarMenuItem key={item.title}>
                {item.url ? (
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    isActive={active && !showChildren}
                    className={ICON}
                  >
                    <Link
                      href={item.url}
                      {...(external && { target: "_blank", rel: "noreferrer" })}
                    >
                      {label}
                    </Link>
                  </SidebarMenuButton>
                ) : (
                  <SidebarMenuButton
                    tooltip={item.title}
                    onClick={item.onSelect}
                    className={ICON}
                  >
                    {label}
                  </SidebarMenuButton>
                )}
                {showChildren && (
                  <SidebarMenu className="mt-0.5 gap-px">
                    {item.children?.map((child) => (
                      <SidebarMenuItem key={child.url}>
                        <SidebarMenuButton
                          asChild
                          isActive={child.url === pathname}
                          className="h-8 pl-[35px] text-[13.5px]"
                        >
                          <Link href={child.url}>{child.title}</Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                )}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      )}
    </SidebarGroup>
  );
}
