"use client";

import { GripVerticalIcon } from "lucide-react";
import type * as React from "react";
import * as ResizablePrimitive from "react-resizable-panels";

import { cn } from "@/lib/utils";

function ResizablePanelGroup({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>) {
  return (
    <ResizablePrimitive.PanelGroup
      data-slot="resizable-panel-group"
      className={cn(
        "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
        className,
      )}
      {...props}
    />
  );
}

function ResizablePanel({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Panel>) {
  return (
    <ResizablePrimitive.Panel
      data-slot="resizable-panel"
      // The library sets overflow:hidden inline, but a static panel is not a
      // containing block, so absolutely positioned descendants (Tailwind's
      // sr-only, tooltips, badges) escape that clip and resolve against the
      // nearest positioned ancestor instead - pushing page-wide scroll when a
      // panel is collapsed to 0. `relative` makes the clip actually apply.
      className={cn("relative", className)}
      {...props}
    />
  );
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & {
  withHandle?: boolean;
}) {
  return (
    <ResizablePrimitive.PanelResizeHandle
      data-slot="resizable-handle"
      className={cn(
        "after:-translate-x-1/2 data-[panel-group-direction=vertical]:after:-translate-y-1/2 relative flex w-px items-center justify-center bg-border transition-colors duration-150 ease-[cubic-bezier(0.2,0,0,1)] after:absolute after:inset-y-0 after:left-1/2 after:w-3 hover:bg-ring focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[resize-handle-state=drag]:bg-ring data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-3 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:translate-x-0 [&[data-panel-group-direction=vertical]>div]:rotate-90",
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-6 w-3.5 items-center justify-center rounded-sm bg-sidebar shadow-[0_0_0_1px_oklch(0_0_0/0.08),0_1px_2px_0_oklch(0_0_0/0.06)] dark:shadow-[0_0_0_1px_oklch(1_0_0/0.1),0_1px_2px_0_oklch(0_0_0/0.4)]">
          <GripVerticalIcon className="size-2.5" />
        </div>
      )}
    </ResizablePrimitive.PanelResizeHandle>
  );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
