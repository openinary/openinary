"use client";

import { AssetsView as DashboardAssetsView } from "@openinary/dashboard";

import { useBucketSwitch } from "@/components/sidebar/bucket-switch-context";
import { ThumbnailGenerator } from "@/components/thumbnail-generator";

export function AssetsView() {
  const { isSwitching } = useBucketSwitch();

  return (
    <DashboardAssetsView
      busy={isSwitching}
      beforeGrid={(folderPath) => <ThumbnailGenerator folderPath={folderPath} />}
    />
  );
}
