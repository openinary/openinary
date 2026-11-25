"use client";

import { ReactNode, Ref, useEffect, useImperativeHandle, useState } from "react";
import { cn } from "../lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";

export function DefaultDialog({
  title,
  isOpen,
  trigger,
  children,
  onClose,
  ref,
  contentClassName,
  onEscapeKeyDown,
}: {
  title: string | ReactNode;
  isOpen?: boolean;
  trigger?: ReactNode;
  children: ReactNode;
  onClose?: () => void;
  ref?: Ref<{ close: () => void }>;
  contentClassName?: string;
  /**
   * Radix hears Escape first (capture phase), so a popup open inside the
   * dialog (a Base UI select, say) can't keep it to itself: call
   * `event.preventDefault()` here while one is open, and only the popup closes.
   */
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(isOpen || false), [isOpen]);

  const handleOpenChange = (v: boolean): void => {
    setOpen(v);

    if (!v) onClose?.();
  };

  useImperativeHandle(ref, () => ({
    close: () => handleOpenChange(false),
  }));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        className={cn("max-w-2xl", contentClassName)}
        onEscapeKeyDown={onEscapeKeyDown}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
