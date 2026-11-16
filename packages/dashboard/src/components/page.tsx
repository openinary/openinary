"use client";

import { cn } from "@openinary/ui/server";
import { Fragment } from "react";

import { useDashboard } from "../adapter";
import { SidebarTrigger } from "../ui/sidebar";

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
        "flex h-svh min-w-0 flex-col overflow-hidden bg-ds-frame md:my-2 md:mr-2 md:h-[calc(100svh-1rem)] md:rounded-[14px] md:shadow-[0_0_0_1px_var(--ds-border)] dark:md:shadow-none",
        className,
      )}
      {...props}
    />
  );
}

export interface Crumb {
  label: React.ReactNode;
  href?: string;
  onClick?: () => void;
}

/**
 * The bar across the top of the sheet: a breadcrumb where there are levels to
 * climb (only the file explorer), and the page's actions on the right. With
 * neither it only holds the mobile sidebar toggle, so it hides on desktop.
 * Stays put while the page scrolls.
 */
export function PageHeader({
  breadcrumb,
  actions,
}: {
  /** The section first. Crumbs with an href or onClick are links. */
  breadcrumb?: Crumb[];
  actions?: React.ReactNode;
}) {
  const { Link } = useDashboard();
  const link =
    "truncate text-ds-muted transition-colors hover:text-ds-text focus-visible:outline-2 focus-visible:outline-ds-ring rounded-[4px]";
  return (
    <header
      className={cn(
        "flex h-14 shrink-0 items-center gap-2 px-3 text-[14px]/5 sm:px-5",
        !breadcrumb && !actions && "md:hidden",
      )}
    >
      <SidebarTrigger className="-ml-1 size-8 text-ds-muted md:hidden" />
      {breadcrumb && (
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 items-center gap-2 overflow-hidden"
        >
          {breadcrumb.map((crumb, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: crumbs are positional
            <Fragment key={index}>
              {index > 0 && (
                <span aria-hidden className="shrink-0 text-[15px] text-ds-faint/70">
                  /
                </span>
              )}
              {crumb.href ? (
                <Link href={crumb.href} className={link}>
                  {crumb.label}
                </Link>
              ) : crumb.onClick ? (
                <button
                  type="button"
                  onClick={crumb.onClick}
                  className={cn(link, "cursor-pointer")}
                >
                  {crumb.label}
                </button>
              ) : (
                <span
                  aria-current={
                    index === breadcrumb.length - 1 ? "page" : undefined
                  }
                  className="truncate font-medium"
                >
                  {crumb.label}
                </span>
              )}
            </Fragment>
          ))}
        </nav>
      )}
      {actions && (
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {actions}
        </div>
      )}
    </header>
  );
}

/**
 * The page under the bar: its title, a one-sentence description, then an
 * optional row with tabs or filters on the left and actions on the right,
 * then the page's tiles. Full width; no page builds its own head.
 */
export function PageHead({
  title,
  badge,
  description,
  tabs,
  actions,
}: {
  title: React.ReactNode;
  badge?: React.ReactNode;
  description?: React.ReactNode;
  /** A segmented control (ds-segments): filters or tabs. */
  tabs?: React.ReactNode;
  /** Toolbar controls, with the one primary action last. */
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2.5">
          <h1 className="font-semibold text-[21px]/7 tracking-[-0.01em]">
            {title}
          </h1>
          {badge}
        </div>
        {description && (
          <p className="max-w-2xl text-[14px]/5 text-ds-muted text-pretty">
            {description}
          </p>
        )}
      </div>
      {(tabs || actions) && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {tabs && (
            <div className="max-w-full overflow-x-auto [scrollbar-width:none]">
              {tabs}
            </div>
          )}
          {actions && (
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              {actions}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Every page that is not the file explorer: the bar, the head, the tiles. */
export function Page({
  title,
  badge,
  description,
  tabs,
  actions,
  className,
  children,
}: {
  title: React.ReactNode;
  badge?: React.ReactNode;
  description?: React.ReactNode;
  tabs?: React.ReactNode;
  actions?: React.ReactNode;
  /** Narrows the column, for pages that are mostly text or forms. */
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Sheet>
      <PageHeader />
      <div className="@container/main min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div
          className={cn(
            "flex w-full flex-col gap-6 px-4 pt-6 pb-12 sm:px-8 md:pt-6.5",
            className,
          )}
        >
          <PageHead
            title={title}
            badge={badge}
            description={description}
            tabs={tabs}
            actions={actions}
          />
          <div className="flex min-w-0 flex-col gap-5">{children}</div>
        </div>
      </div>
    </Sheet>
  );
}
