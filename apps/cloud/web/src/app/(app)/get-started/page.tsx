"use client";

import { Skeleton } from "skullet/react";

import { Checklist } from "@/components/get-started/checklist";
import { GetStartedPage } from "@/components/get-started/page-shell";
import { UploaderCard } from "@/components/get-started/uploader-card";
import { authClient } from "@/lib/auth-client";

export default function Page() {
  const { data: session, isPending } = authClient.useSession();
  const firstName = session?.user.name?.trim().split(" ")[0];

  return (
    <GetStartedPage
      title="Get started"
      // Who it greets depends on the session, so it waits for it under a
      // skeleton rather than swapping one heading for the other.
      heading={
        <Skeleton loading={isPending && !session}>
          {firstName ? `Welcome, ${firstName}` : "Upload once, use everywhere"}
        </Skeleton>
      }
      description="Connect your app so it can send us files, then show them anywhere with one link. Need one smaller, cropped or in another format? Tweak the link, that's all."
    >
      <Checklist />
      <UploaderCard />
    </GetStartedPage>
  );
}
