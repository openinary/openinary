import {
  ReactNode,
  Ref,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";

export interface DialogRefProps {
  open: () => void;
  close: () => void;
}

export default function DefaultDialog({
  title,
  isOpen,
  trigger,
  children,
  onClose,
  ref,
}: {
  title: string | ReactNode;
  isOpen?: boolean;
  trigger?: ReactNode;
  children: ReactNode;
  onClose?: () => void;
  ref?: Ref<DialogRefProps>;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(isOpen || false), [isOpen]);

  const handleOpenChange = (v: boolean): void => {
    setOpen(v);

    if (!v) onClose?.();
  };

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
    close: () => handleOpenChange(false),
  }));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="flex flex-col gap-0 p-0 max-w-2xl [&>button:last-child]:top-3.5">
        <DialogHeader className="contents space-y-0 text-left">
          <DialogTitle className="border-b px-6 py-4 text-base">
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="px-6 py-4">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
