"use client";

import type { MediaFile } from "../types";
import { CopyButton, DetailsCard } from "./delivery-url";
import { formatDate, formatFileSize } from "./utils";

export function AssetInfoTab({
  asset,
  fileSize,
  createdAt,
}: {
  asset: MediaFile;
  fileSize: number | null;
  createdAt: Date | null;
}) {
  const rows = [
    ["Format", asset.name.split(".").pop()?.toUpperCase() ?? ""],
    ["Type", asset.type === "image" ? "Image" : "Video"],
    ["Size", formatFileSize(fileSize)],
    ["Uploaded", formatDate(createdAt)],
  ];

  return (
    <div className="space-y-3">
      <DetailsCard title="Public ID" description="The asset's path, as used in its URLs.">
        <p className="break-all font-mono text-xs">{asset.path}</p>
        <CopyButton value={asset.path} label="Copy ID" className="w-full" />
      </DetailsCard>

      <DetailsCard title="File">
        <dl className="divide-y text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 py-1.5 first:pt-0 last:pb-0">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="truncate text-right">{value}</dd>
            </div>
          ))}
        </dl>
      </DetailsCard>
    </div>
  );
}
