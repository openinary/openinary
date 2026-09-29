"use client";

import {
  Image as ImageIcon,
  type LucideIcon,
  Plug,
  Rocket,
  Video,
} from "lucide-react";

import { Page } from "@/components/page";

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
  heading: string;
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
