"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "openinary:hide-thumbnails";
const EVENT_NAME = "openinary:hide-thumbnails-change";

function getSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "true";
}

function getServerSnapshot(): boolean {
  return false;
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(EVENT_NAME, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT_NAME, callback);
    window.removeEventListener("storage", callback);
  };
}

export function useHideThumbnails(): [boolean, (value: boolean) => void] {
  const hideThumbnails = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const setHideThumbnails = (value: boolean) => {
    window.localStorage.setItem(STORAGE_KEY, String(value));
    window.dispatchEvent(new Event(EVENT_NAME));
  };

  return [hideThumbnails, setHideThumbnails];
}
