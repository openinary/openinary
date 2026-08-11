"use client";

import type * as React from "react";
import { useId, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ButtonVariant = React.ComponentProps<typeof Button>["variant"];

/**
 * Every action in this panel goes through here. Nothing happens on a single
 * click: the dialog first spells out what the action will actually do, because
 * the interesting part is rarely what the button says. "Ban" does not stop the
 * CDN. "Change plan" collects no money. "Suspend" turns three unrelated
 * switches. Reading three lines is cheaper than discovering that on a live
 * account.
 *
 * `confirmWith` adds retyping for the two actions with no undo. A dialog with
 * an OK button is one misplaced click; naming the thing being destroyed is a
 * deliberate act.
 *
 * `field` replaces the window.prompt this started out using - a ban reason and
 * a plan id are part of the decision being confirmed, so they belong in front
 * of the person confirming it, not in a modal that appears before it.
 */
export function ConfirmAction({
  label,
  triggerVariant = "outline",
  disabled,
  title,
  description,
  consequences,
  confirmLabel,
  destructive,
  confirmWith,
  field,
  onConfirm,
}: {
  label: string;
  triggerVariant?: ButtonVariant;
  disabled?: boolean;
  title: string;
  /** One sentence on what this is. */
  description: string;
  /** What it will actually cause - one line each, plainly. */
  consequences: string[];
  confirmLabel: string;
  destructive?: boolean;
  /** Requires typing this exact string first. Use where there is no undo. */
  confirmWith?: string;
  field?: {
    label: string;
    placeholder?: string;
    defaultValue?: string;
    /** Blocks confirmation while empty. */
    required?: boolean;
  };
  onConfirm: (value: string) => void | Promise<void>;
}) {
  const fieldId = useId();
  const confirmId = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [value, setValue] = useState(field?.defaultValue ?? "");

  const ready =
    (!confirmWith || typed === confirmWith) &&
    (!field?.required || value.trim().length > 0);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Reset on close so reopening never inherits a half-typed confirmation
        // from the last time - especially the retyped name, which would
        // otherwise arrive already satisfied.
        if (!next) {
          setTyped("");
          setValue(field?.defaultValue ?? "");
        }
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant={triggerVariant} size="sm" disabled={disabled}>
          {label}
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        <ul className="flex flex-col gap-1.5 text-sm">
          {consequences.map((line) => (
            <li key={line} className="flex gap-2">
              <span aria-hidden className="text-muted-foreground">
                —
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>

        {field ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={fieldId} className="text-muted-foreground">
              {field.label}
            </Label>
            <Input
              id={fieldId}
              value={value}
              placeholder={field.placeholder}
              onChange={(event) => setValue(event.target.value)}
            />
          </div>
        ) : null}

        {confirmWith ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={confirmId} className="text-muted-foreground">
              Type <span className="font-medium font-mono">{confirmWith}</span>{" "}
              to confirm.
            </Label>
            <Input
              id={confirmId}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={!ready}
            onClick={async () => {
              try {
                await onConfirm(value);
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "Request failed",
                );
              }
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
