"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import * as React from "react";

import { cn } from "../lib/utils";

type TabsVariant = "default" | "underline";

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      className={cn(
        "flex flex-col gap-2 data-[orientation=vertical]:flex-row",
        className,
      )}
      data-slot="tabs"
      {...props}
    />
  );
}

function TabsList({
  variant = "default",
  className,
  children,
  ...props
}: TabsPrimitive.List.Props & {
  variant?: TabsVariant;
}) {
  const listRef = React.useRef<HTMLDivElement>(null);

  // The indicator is positioned from measured CSS vars, so a resize would
  // animate toward the new position instead of tracking it. Skip the
  // transition while the list is being resized.
  React.useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      el.dataset.resizing = "";
      clearTimeout(timer);
      timer = setTimeout(() => {
        delete el.dataset.resizing;
      }, 100);
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);

  return (
    <TabsPrimitive.List
      ref={listRef}
      className={cn(
        "relative z-0 flex w-fit items-center justify-center gap-x-0.5 text-muted-foreground",
        "data-[orientation=vertical]:flex-col",
        variant === "default"
          ? "rounded-xl bg-ds-active p-[3px] text-ds-muted inset-ring inset-ring-ds-border dark:bg-ds-panel"
          : "data-[orientation=vertical]:px-1 data-[orientation=horizontal]:py-1 *:data-[slot=tabs-trigger]:hover:bg-accent",
        className,
      )}
      data-slot="tabs-list"
      {...props}
    >
      {children}
      <TabsPrimitive.Indicator
        className={cn(
          "-translate-y-(--active-tab-bottom) absolute bottom-0 left-0 h-(--active-tab-height) w-(--active-tab-width) translate-x-(--active-tab-left) transition-[width,translate] duration-300 ease-move [[data-resizing]_&]:transition-none",
          variant === "underline"
            ? "data-[orientation=vertical]:-translate-x-px z-10 bg-primary data-[orientation=horizontal]:h-0.5 data-[orientation=vertical]:w-0.5 data-[orientation=horizontal]:translate-y-px"
            : "-z-1 rounded-[9px] bg-(--ds-raised) shadow-(--ds-thumb-shadow) dark:bg-ds-active",
        )}
        data-slot="tab-indicator"
      />
    </TabsPrimitive.List>
  );
}

function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      className={cn(
        "[&_svg]:-mx-0.5 flex shrink-0 grow cursor-pointer items-center justify-center whitespace-nowrap rounded-[9px] border border-transparent font-medium text-[13.5px]/5 tracking-[-0.01em] outline-none transition-[color,scale] duration-150 focus-visible:outline-2 focus-visible:outline-ds-ring active:scale-[0.97] data-disabled:pointer-events-none data-disabled:opacity-64 motion-reduce:active:scale-100 [&_svg:not([class*='size-'])]:size-3.5 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        "hover:text-ds-text data-active:text-ds-text",
        "h-7 gap-1.5 px-3",
        "data-[orientation=vertical]:w-full data-[orientation=vertical]:justify-start",
        className,
      )}
      data-slot="tabs-trigger"
      {...props}
    />
  );
}

function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      className={cn("flex-1 outline-none", className)}
      data-slot="tabs-content"
      {...props}
    />
  );
}

export {
  Tabs,
  TabsList,
  TabsTab,
  TabsTab as TabsTrigger,
  TabsPanel,
  TabsPanel as TabsContent,
};
