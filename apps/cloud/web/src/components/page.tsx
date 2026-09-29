"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";

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
 * The frame of every page that is not the file explorer: one centred column
 * with the breadcrumb, an icon tile, the title and its description, then the
 * page's sections. No header bar - the breadcrumb scrolls with the content.
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
  /** Parents first. The last entry is this page and takes no href. */
  breadcrumb: { label: string; href?: string }[];
  icon: LucideIcon;
  title: React.ReactNode;
  badge?: React.ReactNode;
  description?: React.ReactNode;
  /** Widens the column, for pages that hold more than text. */
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen w-full overflow-auto">
      <div
        className={cn(
          "mx-auto w-full max-w-2xl px-4 pt-6 pb-16 sm:px-6 md:pt-14",
          className,
        )}
      >
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-1 md:hidden" />
          <Breadcrumb className="min-w-0">
            <BreadcrumbList className="flex-nowrap gap-2 sm:gap-2">
              {breadcrumb.map((item, index) => (
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
                          {index === 0 && <Icon className="size-3.5" />}
                          {item.label}
                        </Link>
                      </BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage className="flex items-center gap-1.5 truncate">
                        {index === 0 && (
                          <Icon className="size-3.5 text-muted-foreground" />
                        )}
                        {item.label}
                      </BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        <div className="mt-8 flex size-10 items-center justify-center rounded-xl border bg-background shadow-xs">
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
  );
}
