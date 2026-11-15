"use client";

import { type LucideIcon, Settings } from "lucide-react";

import { useDashboard } from "../../adapter";
import { PageHeader, Sheet } from "../page";
import { Separator } from "../../ui/separator";
import { cn } from "@openinary/ui/server";

export interface SettingsPageEntry {
  value: string;
  label: string;
  description: string;
  icon: LucideIcon;
  content: React.ComponentType;
  /** Takes the whole width, for pages that are tables and charts. */
  wide?: boolean;
}

/**
 * Every settings route: the title, one tab per section, then the section
 * itself. Left-aligned, unlike the centred Page frame, with the section held
 * to a readable measure.
 */
export function SettingsPage({
  tab,
  pages,
}: {
  tab: string;
  pages: readonly SettingsPageEntry[];
}) {
  const { Link, notFound } = useDashboard();
  const page = pages.find(({ value }) => value === tab);
  if (!page) return notFound();

  return (
    <Sheet>
      <PageHeader
        breadcrumb={[
          { label: "Settings", icon: Settings },
          { label: page.label },
        ]}
        icon={page.icon}
      />
      <div className="min-h-0 flex-1 overflow-auto px-4 pt-2 pb-16 sm:px-6">
        <h1 className="font-semibold text-lg">Settings</h1>

        {/* The rule is an inset shadow, not a border: the nav scrolls
            sideways on narrow screens, and overflow would clip a border the
            active tab has to sit on top of. */}
        <nav className="mt-8 flex w-fit max-w-full overflow-x-auto shadow-[inset_0_-1px_0_var(--border)] [scrollbar-width:none]">
          {pages.map(({ value, label }) => (
            <Link
              key={value}
              href={`/settings/${value}`}
              aria-current={value === tab ? "page" : undefined}
              className={cn(
                "shrink-0 border-b-2 px-4 pb-2.5 font-medium text-sm transition-colors",
                value === tab
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>

        <h2 className="mt-8 font-semibold text-base">{page.label}</h2>
        <p className="mt-1 text-muted-foreground text-sm">{page.description}</p>
        <Separator className="my-6" />
        <div className={cn("@container", !page.wide && "max-w-4xl")}>
          <page.content />
        </div>
      </div>
    </Sheet>
  );
}
