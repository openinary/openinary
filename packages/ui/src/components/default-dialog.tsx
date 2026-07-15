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
}: {
  title: string | ReactNode;
  isOpen?: boolean;
  trigger?: ReactNode;
  children: ReactNode;
  onClose?: () => void;
  ref?: Ref<{ close: () => void }>;
  contentClassName?: string;
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
      <DialogContent className={cn("max-w-2xl", contentClassName)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
