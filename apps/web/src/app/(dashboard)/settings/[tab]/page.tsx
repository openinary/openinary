"use client";

import { Settings } from "lucide-react";
import { notFound } from "next/navigation";
import { use } from "react";

import { Page } from "@/components/page";
import { SETTINGS_PAGES } from "@/components/settings/settings-pages";

export default function SettingsPage({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  const { tab } = use(params);
  const page = SETTINGS_PAGES.find(({ value }) => value === tab);
  if (!page) notFound();

  return (
    <Page
      breadcrumb={[
        { label: "Settings", href: "/settings", icon: Settings },
        { label: page.label },
      ]}
      icon={page.icon}
      title={page.label}
      description={page.description}
    >
      <page.content />
    </Page>
  );
}
