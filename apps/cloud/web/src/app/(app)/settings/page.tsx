"use client";

import { ChevronRight, Settings } from "lucide-react";
import Link from "next/link";

import { Page } from "@/components/page";
import { SETTINGS_PAGES } from "@/components/settings/settings-pages";

export default function SettingsIndex() {
  return (
    <Page
      breadcrumb={[{ label: "Settings" }]}
      icon={Settings}
      title="Settings"
      description="Everything about this account: how the dashboard looks, where files go, who can reach them and what it costs."
    >
      <ul className="overflow-hidden rounded-lg border">
        {SETTINGS_PAGES.map(({ value, label, description, icon: Icon }) => (
          <li key={value} className="border-b last:border-0">
            <Link
              href={`/settings/${value}`}
              className="flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-muted/50"
            >
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="shrink-0 font-medium">{label}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {description}
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  );
}
