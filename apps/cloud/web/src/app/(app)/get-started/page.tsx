"use client";

import { Checklist } from "@/components/get-started/checklist";
import { GetStartedPage } from "@/components/get-started/page-shell";
import { UploaderCard } from "@/components/get-started/uploader-card";
import { authClient } from "@/lib/auth-client";

export default function Page() {
  const { data: session } = authClient.useSession();
  const firstName = session?.user.name?.trim().split(" ")[0];

  return (
    <GetStartedPage
      title="Get started"
      heading={
        firstName ? `Welcome, ${firstName}` : "Upload once, use everywhere"
      }
      description="Connect your app so it can send us files, then show them anywhere with one link. Need one smaller, cropped or in another format? Tweak the link, that's all."
    >
      <Checklist />
      <UploaderCard />
    </GetStartedPage>
  );
}
