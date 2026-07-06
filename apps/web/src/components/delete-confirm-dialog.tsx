"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Spinner } from "./ui/spinner";

export function DeleteConfirmDialog({
  isOpen,
  onClose,
  title,
  description,
  onConfirm,
  confirmLabel = "Delete",
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  onConfirm: () => Promise<void>;
  confirmLabel?: string;
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await onConfirm();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[384px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="-mx-4 -mb-4 flex-row justify-end gap-2 space-x-0 sm:space-x-0 rounded-b-lg border-t bg-muted/50 px-4 py-4">
          <DialogClose asChild>
            <Button size="sm" variant="outline" disabled={isDeleting}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            size="sm"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isDeleting}
            className="w-[70px]"
          >
            {isDeleting ? <Spinner size={16} /> : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
