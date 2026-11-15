"use client";

import { GetStartedHome } from "@openinary/dashboard";
import { authClient } from "@/lib/auth-client";

export default function Page() {
  const { data: session, isPending } = authClient.useSession();
  return (
    <GetStartedHome
      userName={session?.user.name}
      loading={isPending && !session}
      description="Connect your app so it can send us files, then show them anywhere with one link. Need one smaller, cropped or in another format? Tweak the link, that's all."
    />
  );
}
