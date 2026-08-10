"use client";

import { useEffect } from "react";

import { OptimizePanel } from "@/components/playground/optimize-panel";
import { TransformCatalog } from "@/components/playground/transform-catalog";
import { trackPlaygroundOpened } from "@/lib/analytics";

export function ImagesPlayground() {
  useEffect(() => trackPlaygroundOpened("images"), []);

  return (
    <>
      <OptimizePanel />
      <TransformCatalog />
    </>
  );
}
