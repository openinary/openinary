"use client";

import type { LucideIcon } from "lucide-react";

import { useDashboard } from "../../adapter";
import { Page } from "../page";

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
 * Every settings route: the Page scaffold with one segment per section, then
 * the section itself as tiles.
 */
export function SettingsPage({
  tab,
  pages,
}: {
  tab: string;
  pages: readonly SettingsPageEntry[];
}) {
  const { notFound } = useDashboard();
  const page = pages.find(({ value }) => value === tab);
  if (!page) return notFound();

  return (
    <Page
      title={page.label}
      description={page.description}
      className={page.wide ? undefined : "max-w-5xl"}
    >
      <div className="@container flex flex-col gap-5">
        <page.content />
      </div>
    </Page>
  );
}
