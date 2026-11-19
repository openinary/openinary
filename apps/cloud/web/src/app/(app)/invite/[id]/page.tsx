import { InviteView } from "@/components/invite-view";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <InviteView id={(await params).id} />;
}
