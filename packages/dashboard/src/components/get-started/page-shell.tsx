"use client";

import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Skeleton } from "skullet/react";

import { useCanManageApiKeys, useDashboard } from "../../adapter";
import { useDocumentTitle } from "../../hooks/use-document-title";
import {
  SolarImages,
  SolarIntegrate,
  SolarKey,
  SolarUploader,
  SolarVideos,
} from "../../ui/solar-icons";
import { Page } from "../page";
import { Checklist } from "./checklist";
import { UploaderCard } from "./uploader-card";
import { useOnboarding } from "./use-onboarding";

const rootTitle = "Home";

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
  useDocumentTitle(title);
  return (
    <Page
      title={heading}
      description={description}
      // The playgrounds hold a preview and its controls side by side.
      className={title === rootTitle ? undefined : "max-w-4xl"}
    >
      {children}
    </Page>
  );
}

/** Where people go next, one row each. */
function Shortcuts() {
  const { Link, docsUrl } = useDashboard();
  const canManageKeys = useCanManageApiKeys();
  const rows = [
    { label: "Upload files", href: "/?upload=true", icon: SolarUploader },
    { label: "Connect your app", href: "/get-started/integrate", icon: SolarIntegrate },
    { label: "Try image transformations", href: "/get-started/images", icon: SolarImages },
    { label: "Try video transformations", href: "/get-started/videos", icon: SolarVideos },
    // Not every role may open the keys page (Cloud team members can't).
    ...(canManageKeys
      ? [{ label: "Create an API key", href: "/settings/api-keys", icon: SolarKey }]
      : []),
  ];
  const row =
    "group flex h-10 items-center gap-2.5 px-4 text-[13px]/5 text-ds-secondary transition-colors hover:bg-ds-row-hover hover:text-ds-text";
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="px-1 font-medium text-[13px]/5">Shortcuts</h2>
      <ul className="ds-tile ds-tile-rows py-1">
        {rows.map((item) => (
          <li key={item.label}>
            <Link href={item.href} className={row}>
              <item.icon className="size-4 shrink-0 text-ds-faint" />
              <span className="flex-1">{item.label}</span>
              <ArrowRight className="mi-arrow size-3.5 text-ds-faint" />
            </Link>
          </li>
        ))}
        <li>
          <a href={docsUrl} target="_blank" rel="noreferrer" className={row}>
            <ArrowUpRight className="size-4 shrink-0 text-ds-faint" />
            <span className="flex-1">Documentation</span>
          </a>
        </li>
      </ul>
    </section>
  );
}

/** /get-started: the greeting, setup and shortcuts, the uploader. */
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
  const { isComplete } = useOnboarding();
  return (
    <GetStartedPage
      title={rootTitle}
      // Who it greets depends on the session, so it waits for it under a
      // skeleton rather than swapping one heading for the other.
      heading={
        <Skeleton loading={loading}>
          {firstName ? `Hey ${firstName} 👋` : "Hey there 👋"}
        </Skeleton>
      }
      description={description}
    >
      <div className="grid items-start gap-x-5 gap-y-5 lg:grid-cols-2">
        {isComplete ? null : <Checklist />}
        <Shortcuts />
        <UploaderCard />
      </div>
    </GetStartedPage>
  );
}
