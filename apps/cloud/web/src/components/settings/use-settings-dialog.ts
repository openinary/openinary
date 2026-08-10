"use client";

import { parseAsStringEnum, useQueryState } from "nuqs";

export const SETTINGS_TABS = [
  "appearance",
  "buckets",
  "storage",
  "api-keys",
  "plan",
  "activity",
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

/**
 * Presence of the "settings" query param controls both open state and the
 * active tab, so the dialog is shareable/bookmarkable via URL.
 *
 * Lives apart from settings-dialog.tsx because the tabs it renders link to each
 * other (Buckets → Plan), and importing the hook from there would put those
 * tabs in an import cycle with their own host.
 */
export function useSettingsDialog() {
  return useQueryState(
    "settings",
    parseAsStringEnum<SettingsTab>([...SETTINGS_TABS]).withOptions({
      clearOnDefault: true,
    }),
  );
}
