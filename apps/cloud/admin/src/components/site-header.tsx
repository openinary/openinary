"use client";

import { Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { isActive, NAV } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

/**
 * Which icon shows is decided by CSS, not by state: the server has no idea
 * what the browser's preference is, and rendering the wrong one for a frame -
 * or blanking the button until mount - is worse than letting the .dark class
 * pick. `resolvedTheme` is only read in the click handler, which runs long
 * after hydration.
 */
function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <HugeiconsIcon
        icon={Sun03Icon}
        strokeWidth={2}
        className="block dark:hidden"
      />
      <HugeiconsIcon
        icon={Moon02Icon}
        strokeWidth={2}
        className="hidden dark:block"
      />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  // A user's fiche puts their email in its own <h1>, so the header names the
  // section rather than repeating it.
  const title = pathname.startsWith("/users/")
    ? "Account"
    : (NAV.find((item) => isActive(pathname, item.url))?.title ??
      "Openinary Admin");

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="font-medium text-base">{title}</h1>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
