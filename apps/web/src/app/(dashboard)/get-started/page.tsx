"use client";

import { GetStartedHome } from "@openinary/dashboard";
import { useSession } from "@/lib/auth-client";

export default function Page() {
  const { data: session, isPending } = useSession();
  return (
    <GetStartedHome
      userName={session?.user.name}
      loading={isPending && !session}
      description="Connect your app so it can send files to your instance, then show them anywhere with one link. Need one smaller, cropped or in another format? Tweak the link, that's all."
    />
  );
}
