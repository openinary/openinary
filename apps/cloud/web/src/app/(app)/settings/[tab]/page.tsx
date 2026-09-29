import { SettingsPage } from "@/components/settings/settings-page";

export default async function Page({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  return <SettingsPage tab={(await params).tab} />;
}
