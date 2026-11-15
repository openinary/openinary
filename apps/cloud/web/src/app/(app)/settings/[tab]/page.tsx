import { Settings } from "@/components/settings/settings-pages";

export default async function Page({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  return <Settings tab={(await params).tab} />;
}
