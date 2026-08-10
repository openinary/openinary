"use client";

import { useEffect } from "react";

import { VideoPanel } from "@/components/playground/video-panel";
import { trackPlaygroundOpened } from "@/lib/analytics";

export function VideosPlayground() {
  useEffect(() => trackPlaygroundOpened("videos"), []);

  return <VideoPanel />;
}
