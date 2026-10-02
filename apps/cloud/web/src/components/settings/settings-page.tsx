"use client";

import { Settings } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader, Sheet } from "@/components/page";
import { SETTINGS_PAGES } from "@/components/settings/settings-pages";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/**
 * Every settings route: the title, one tab per section, then the section
 * itself. Left-aligned, unlike the centred Page frame, with the section held
 * to a readable measure.
 */
export function SettingsPage({ tab }: { tab: string }) {
  const page = SETTINGS_PAGES.find(({ value }) => value === tab);
  if (!page) notFound();

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
          {SETTINGS_PAGES.map(({ value, label }) => (
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
