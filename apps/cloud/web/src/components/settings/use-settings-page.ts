"use client";

import { useRouter } from "next/navigation";

export const SETTINGS_TABS = [
  "appearance",
  "buckets",
  "storage",
  "api-keys",
  "billing",
  "logs",
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

/**
 * Opens a settings page. Every settings tab is a route, /settings/<tab>, so
 * this is a push - kept as a hook because most callers are buttons and menu
 * items, not links.
 *
 * Lives apart from settings-pages.tsx because the tabs it lists link to each
 * other (Buckets -> Plan), and importing from there would put those tabs in an
 * import cycle with their own host.
 */
export function useSettingsPage() {
  const router = useRouter();
  return (tab: SettingsTab) => router.push(`/settings/${tab}`);
}
