"use client";

import { ArrowUpRight, ExternalLink } from "lucide-react";
import { encodePath } from "../lib/utils";
import { Button } from "../ui/button";
import type { MediaFile } from "../types";
import { CopyButton, DeliveryUrl, DetailsCard } from "./delivery-url";

const DOCS = "https://docs.openinary.dev";

export function AssetDeliverTab({
  asset,
  mediaUrl,
  onOpenInNewTab,
}: {
  asset: MediaFile;
  mediaUrl: string;
  onOpenInNewTab: () => void;
}) {
  const guides = [
    { label: "Next.js", href: `${DOCS}/guides/integrate/nextjs` },
    { label: "React", href: `${DOCS}/guides/integrate/react` },
    {
      label: `${asset.type === "image" ? "Image" : "Video"} transformations`,
      href: `${DOCS}/media-transformations/${asset.type}-transformations`,
    },
  ];

  return (
    <div className="space-y-3">
      <DetailsCard
        title="Delivery URL"
        description={
          asset.type === "image"
            ? "Public link, served in the lightest format each browser supports."
            : "Public link you can embed anywhere."
        }
      >
        <DeliveryUrl url={mediaUrl} path={encodePath(asset.path)} />
        <div className="grid grid-cols-2 gap-2">
          <CopyButton value={mediaUrl} />
          <Button variant="outline" size="sm" onClick={onOpenInNewTab}>
            <ExternalLink />
            Open
          </Button>
        </div>
      </DetailsCard>

      <DetailsCard title="Use it in your code">
        {/* Pulled out by the links' own padding, so their text lines up with
            the card's title while the hover fills sit 4px inside its edges,
            the bottom one included. */}
        <ul className="-mx-2 -mb-2">
          {guides.map((guide) => (
            <li key={guide.href}>
              <a
                href={guide.href}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {guide.label}
                <ArrowUpRight className="size-3.5" />
              </a>
            </li>
          ))}
        </ul>
      </DetailsCard>
    </div>
  );
}
