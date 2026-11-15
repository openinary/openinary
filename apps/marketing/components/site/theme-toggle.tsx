"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { focusRing } from "@/components/site/ui";
import { cn } from "@/lib/utils";

const order = ["system", "light", "dark"] as const;
const label = { system: "System", light: "Light", dark: "Dark" };

/** "Theme: System", like serveros.com's footer: each click moves to the next. */
export function ThemeToggle() {
  const { theme = "system", setTheme } = useTheme();
  // The stored choice is only known in the browser, so the server and the
  // first client render both say System and the real one follows.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const current = (mounted && order.includes(theme as never) ? theme : "system") as (typeof order)[number];
  const next = order[(order.indexOf(current) + 1) % order.length];

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Theme: ${label[current]}. Switch to ${label[next]}`}
      className={cn("w-fit rounded-sm transition-colors hover:text-ink-12", focusRing)}
    >
      Theme: {label[current]}
    </button>
  );
}
