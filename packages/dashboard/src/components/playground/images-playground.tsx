"use client";

import { useEffect } from "react";

import { OptimizePanel } from "./optimize-panel";
import { TransformCatalog } from "./transform-catalog";
import { useDashboard } from "../../adapter";

export function ImagesPlayground() {
  const { analytics } = useDashboard();
  useEffect(() => {
    analytics?.playgroundOpened("images");
  }, [analytics]);

  return (
    <>
      <OptimizePanel />
      <TransformCatalog />
    </>
  );
}
