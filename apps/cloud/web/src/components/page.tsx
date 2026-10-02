"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";

import { HistoryNav } from "@/components/history-nav";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/**
 * The white sheet every route draws on. The shell around it is the sidebar's
 * grey, so the sheet floats on it - inset by the sidebar's own padding on the
 * left and matched here on the other three sides. Full-bleed on mobile, where
 * the sidebar is a drawer and there is no grey to inset into.
 */
export function Sheet({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex h-svh min-w-0 flex-col overflow-hidden bg-background md:my-2 md:mr-2 md:h-[calc(100svh-1rem)] md:rounded-xl md:border md:shadow-xs",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The head of the sheet: history arrows, where you are, and what you can do
 * here. Stays put while the page scrolls under it.
 */
export function PageHeader({
  breadcrumb,
  icon: Icon,
  actions,
}: {
  /**
   * Parents first. The last entry is this page and takes no href. The first
   * one shows an icon: its own, so a section keeps the same one on every page
   * under it, or the page's when it has none.
   */
  breadcrumb: { label: string; href?: string; icon?: LucideIcon }[];
  icon: LucideIcon;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 px-1.5">
      <SidebarTrigger className="md:hidden" />
      <HistoryNav />
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList className="flex-nowrap gap-2 sm:gap-2">
          {breadcrumb.map(({ icon: ItemIcon = Icon, ...item }, index) => (
            <Fragment key={item.label}>
              {index > 0 && (
                <BreadcrumbSeparator className="text-muted-foreground/60">
                  /
                </BreadcrumbSeparator>
              )}
              <BreadcrumbItem className="min-w-0">
                {item.href ? (
                  <BreadcrumbLink asChild>
                    <Link
                      href={item.href}
                      className="flex items-center gap-1.5"
                    >
                      {index === 0 && <ItemIcon className="size-3.5" />}
                      {item.label}
                    </Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage className="flex items-center gap-1.5 truncate">
                    {index === 0 && (
                      <ItemIcon className="size-3.5 text-muted-foreground" />
                    )}
                    {item.label}
                  </BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </header>
  );
}

/**
 * The frame of every page that is not the file explorer: the header, then one
 * centred column with an icon tile, the title and its description, then the
 * page's sections.
 */
export function Page({
  breadcrumb,
  icon: Icon,
  title,
  badge,
  description,
  className,
  children,
}: {
  breadcrumb: React.ComponentProps<typeof PageHeader>["breadcrumb"];
  icon: LucideIcon;
  title: React.ReactNode;
  badge?: React.ReactNode;
  description?: React.ReactNode;
  /** Widens the column, for pages that hold more than text. */
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Sheet>
      <PageHeader breadcrumb={breadcrumb} icon={Icon} />
      <div className="@container/main min-h-0 flex-1 overflow-auto">
        <div
          className={cn(
            "mx-auto w-full max-w-2xl px-4 pt-2 pb-16 sm:px-6 md:pt-8",
            className,
          )}
        >
          <div className="flex size-10 items-center justify-center rounded-xl border bg-background shadow-xs">
            <Icon className="size-5" />
          </div>
          <div className="mt-5 flex items-center gap-2">
            <h1 className="font-medium text-base">{title}</h1>
            {badge}
          </div>
          {description && (
            <p className="mt-1.5 text-muted-foreground text-sm leading-relaxed">
              {description}
            </p>
          )}

          <div className="mt-8 space-y-8">{children}</div>
        </div>
      </div>
    </Sheet>
  );
}
