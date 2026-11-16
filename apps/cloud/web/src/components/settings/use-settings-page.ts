"use client";

import { useRouter } from "next/navigation";

import type { SETTINGS_PAGES } from "@/components/settings/settings-pages";

export type SettingsTab = (typeof SETTINGS_PAGES)[number]["value"];

/**
 * Opens a settings page. Every settings tab is a route, /settings/<tab>, so
 * this is a push - kept as a hook because most callers are buttons and menu
 * items, not links.
 *
 * Lives apart from settings-pages.tsx because the tabs it lists link to each
 * other (Buckets -> Plan): only the type comes from there, so the tabs are not
 * in an import cycle with their own host.
 */
export function useSettingsPage() {
  const router = useRouter();
  return (tab: SettingsTab) => router.push(`/settings/${tab}`);
}
