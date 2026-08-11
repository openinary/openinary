"use client";

import Link from "next/link";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

const rootTitle = "Get started";

/**
 * The chrome every Get started route renders inside the shell's SidebarInset.
 * Mirrors HeaderBar's height and shadow so switching between Assets and a
 * playground doesn't shift the header.
 */
export function GetStartedPage({
  title,
  heading,
  description,
  children,
}: {
  title: string;
  heading: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="@container/main h-screen w-full">
      <header className="flex h-16 shrink-0 items-center gap-2 shadow-[0_1px_0_0_oklch(0_0_0/0.06),0_2px_4px_-2px_oklch(0_0_0/0.04)] transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 dark:shadow-[0_1px_0_0_oklch(1_0_0/0.08),0_2px_4px_-2px_oklch(0_0_0/0.4)]">
        <div className="flex w-full items-center gap-2 @2xl/main:px-6 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-[orientation=vertical]:h-4"
          />
          <Breadcrumb className="min-w-0">
            <BreadcrumbList className="flex-nowrap">
              <BreadcrumbItem className="shrink-0">
                {title === rootTitle ? (
                  <BreadcrumbPage>{rootTitle}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href="/get-started">{rootTitle}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {title !== rootTitle && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem className="min-w-0">
                    <BreadcrumbPage className="truncate">
                      {title}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
      <div className="h-[calc(100vh-64px)] overflow-auto @2xl/main:px-6 px-4 @2xl/main:py-8 py-6">
        <div className="mx-auto max-w-3xl space-y-8">
          <div>
            <h1 className="font-semibold text-2xl tracking-tight">{heading}</h1>
            <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
              {description}
            </p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
