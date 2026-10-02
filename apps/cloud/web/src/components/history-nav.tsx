"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type NavigationLike = EventTarget & {
  canGoBack: boolean;
  canGoForward: boolean;
};

/**
 * Back and forward through the browser's own history, at the head of every
 * page. Only the Navigation API knows whether there is anywhere to go, so
 * where it is missing both arrows stay enabled and a dead click does nothing.
 */
export function HistoryNav() {
  const router = useRouter();
  const [can, setCan] = useState({ back: true, forward: true });

  useEffect(() => {
    const nav = (window as { navigation?: NavigationLike }).navigation;
    if (!nav) return;
    const update = () =>
      setCan({ back: nav.canGoBack, forward: nav.canGoForward });
    update();
    // Next pushes history from inside an insertion effect, and this event
    // fires synchronously with it - where React forbids state updates.
    const onChange = () => queueMicrotask(update);
    nav.addEventListener("currententrychange", onChange);
    return () => nav.removeEventListener("currententrychange", onChange);
  }, []);

  return (
    <div className="flex shrink-0 items-center">
      <Button
        variant="ghost"
        size="icon"
        className="size-9 text-muted-foreground"
        disabled={!can.back}
        onClick={() => router.back()}
        aria-label="Go back"
      >
        <ChevronLeft className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-9 text-muted-foreground"
        disabled={!can.forward}
        onClick={() => router.forward()}
        aria-label="Go forward"
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
