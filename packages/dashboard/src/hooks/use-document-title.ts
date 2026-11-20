"use client";

import { useEffect, useRef } from "react";

import { useDashboard } from "../adapter";

// Every mounted title, oldest first: the newest one with a value wins, so an
// overlay (onboarding) beats the page under it and hands the tab back when it
// goes. The layout's static metadata title is the fallback.
const stack: { title: string | null }[] = [];
let fallback: string | undefined;
let observer: MutationObserver | undefined;

function current(): string | null {
  let i = stack.length - 1;
  while (i >= 0 && !stack[i].title) i--;
  return stack[i]?.title ?? null;
}

function apply() {
  fallback ??= document.title;
  const title = current() ?? fallback;
  if (document.title !== title) document.title = title;
  // Next swaps its metadata <title> on every client navigation, after the new
  // page's effects ran, which would put the layout's title back over ours.
  // Only while a page holds a title: otherwise Next's (the 404's) stands.
  observer ??= new MutationObserver(() => {
    const title = current();
    if (title && document.title !== title) document.title = title;
  });
  observer.observe(document.head, { childList: true, subtree: true, characterData: true });
}

/** Sets the tab title as given while mounted. Null leaves it to the others. */
export function useTabTitle(title: string | null | undefined) {
  const entry = useRef({ title: null as string | null }).current;
  useEffect(() => {
    stack.push(entry);
    return () => {
      stack.splice(stack.indexOf(entry), 1);
      apply();
    };
  }, [entry]);
  useEffect(() => {
    entry.title = title || null;
    apply();
  }, [entry, title]);
}

/** GitHub-style tab title, "Page · Workspace", so bookmarks and tabs tell pages apart. */
export function useDocumentTitle(page: string | null | undefined) {
  const workspace = useDashboard().useWorkspaceName();
  // Until the workspace is known the layout's title stays, rather than a
  // suffix-less one that changes again a moment later.
  useTabTitle(page && workspace ? `${page} · ${workspace}` : null);
}

/** The last segment of a storage path: "photos/2026/cow.png" -> "cow.png". */
export function baseName(path: string): string {
  return path.replace(/\/+$/, "").split("/").pop() || path;
}
