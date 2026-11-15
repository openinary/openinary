"use client";

import {
  Image as ImageIcon,
  type LucideIcon,
  Plug,
  Rocket,
  Video,
} from "lucide-react";
import { Skeleton } from "skullet/react";

import { Page } from "../page";
import { Checklist } from "./checklist";
import { UploaderCard } from "./uploader-card";

const rootTitle = "Get started";

const ICONS: Record<string, LucideIcon> = {
  Integrate: Plug,
  Images: ImageIcon,
  Videos: Video,
};

/** Every Get started route, in the shared page frame. */
export function GetStartedPage({
  title,
  heading,
  description,
  children,
}: {
  title: string;
  heading: React.ReactNode;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Page
      breadcrumb={
        title === rootTitle
          ? [{ label: rootTitle }]
          : [
              { label: rootTitle, href: "/get-started", icon: Rocket },
              { label: title },
            ]
      }
      icon={ICONS[title] ?? Rocket}
      title={heading}
      description={description}
      // The playgrounds hold a preview and its controls side by side.
      className="max-w-3xl"
    >
      {children}
    </Page>
  );
}

/** /get-started: a greeting, the checklist, then the uploader. */
export function GetStartedHome({
  userName,
  loading,
  description,
}: {
  userName: string | null | undefined;
  /** The session is still loading. */
  loading: boolean;
  description: string;
}) {
  const firstName = userName?.trim().split(" ")[0];
  return (
    <GetStartedPage
      title={rootTitle}
      // Who it greets depends on the session, so it waits for it under a
      // skeleton rather than swapping one heading for the other.
      heading={
        <Skeleton loading={loading}>
          {firstName ? `Welcome, ${firstName}` : "Upload once, use everywhere"}
        </Skeleton>
      }
      description={description}
    >
      <Checklist />
      <UploaderCard />
    </GetStartedPage>
  );
}
