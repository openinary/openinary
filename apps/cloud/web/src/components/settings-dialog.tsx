"use client";

import {
  AppearanceTab,
  SettingsDialog as OpeninarySettingsDialog,
  StorageTab,
} from "@openinary/ui";
import {
  Boxes,
  CreditCard,
  HardDrive,
  KeyRound,
  Palette,
  ScrollText,
} from "lucide-react";

import { ActivityTab } from "@/components/settings/activity-tab";
import { ApiKeysTab } from "@/components/settings/api-keys-tab";
import { BucketsTab } from "@/components/settings/buckets-tab";
import { PlanTab } from "@/components/settings/plan-tab";
import {
  type SettingsTab as Tab,
  useSettingsDialog,
} from "@/components/settings/use-settings-dialog";

export { useSettingsDialog };

const NAV = [
  { value: "appearance", label: "Appearance", icon: Palette },
  { value: "buckets", label: "Buckets", icon: Boxes },
  { value: "storage", label: "Storage", icon: HardDrive },
  { value: "api-keys", label: "API Keys", icon: KeyRound },
  { value: "plan", label: "Plan", icon: CreditCard },
  { value: "activity", label: "Usage", icon: ScrollText },
];

export function SettingsDialog() {
  const [tab, setTab] = useSettingsDialog();

  return (
    <OpeninarySettingsDialog
      open={tab !== null}
      onOpenChange={(open) => setTab(open ? "appearance" : null)}
      nav={NAV}
      tab={tab ?? "appearance"}
      onTabChange={(value) => setTab(value as Tab)}
    >
      {tab === "appearance" && <AppearanceTab />}
      {tab === "buckets" && <BucketsTab />}
      {tab === "storage" && <StorageTab />}
      {tab === "api-keys" && <ApiKeysTab />}
      {tab === "plan" && <PlanTab />}
      {tab === "activity" && <ActivityTab />}
    </OpeninarySettingsDialog>
  );
}
