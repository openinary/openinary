"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { type PointerEvent, type ReactNode, useRef, useState } from "react";
import { cn } from "../lib/utils";

// How far, or how fast (px/ms), the handle has to travel down to dismiss.
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 0.5;

/**
 * A sheet that rises from the bottom of a small screen, dismissed by
 * dragging its top handle down (or Escape, or a tap on the backdrop). Only
 * the handle drags, so the content below keeps scrolling normally.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Read out by screen readers; the sheet shows no title of its own. */
  title: string;
  children: ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const drag = useRef<{ y: number; t: number } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const end = (event: PointerEvent) => {
    if (!drag.current) return;
    const distance = event.clientY - drag.current.y;
    const velocity = distance / Math.max(1, event.timeStamp - drag.current.t);
    drag.current = null;
    setOffset(0);
    if (distance > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY) {
      onOpenChange(false);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          ref={contentRef}
          aria-describedby={undefined}
          // Focus the sheet, not its first button: that one would light up
          // with its tooltip, which then takes the first Escape.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            contentRef.current?.focus();
          }}
          style={{ translate: `0 ${offset}px` }}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex h-[85dvh] flex-col rounded-t-2xl border-t bg-sidebar text-sidebar-foreground shadow-lg outline-none",
            "duration-300 ease-[cubic-bezier(0.2,0,0,1)] data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom",
            !drag.current && "transition-[translate]",
          )}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <div
            aria-hidden
            className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { y: event.clientY, t: event.timeStamp };
            }}
            onPointerMove={(event) => {
              if (drag.current) setOffset(Math.max(0, event.clientY - drag.current.y));
            }}
            onPointerUp={end}
            onPointerCancel={end}
          >
            <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
