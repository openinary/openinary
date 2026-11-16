"use client";

import { useEffect } from "react";

import { VideoPanel } from "./video-panel";
import { useDashboard } from "../../adapter";

export function VideosPlayground() {
  const { analytics } = useDashboard();
  useEffect(() => {
    analytics?.playgroundOpened("videos");
  }, [analytics]);

  return <VideoPanel />;
}
