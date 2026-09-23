"use client";

import { Check, Copy } from "lucide-react";

import { focusRing, pressable } from "@/components/home/cta-button";
import { useCopy } from "@/hooks/use-copy";
import { cn } from "@/lib/utils";

/**
 * A shell command the visitor can copy.
 *
 * The leading `~` is a prompt, not part of the command, so it is shown but
 * never copied: pasting it would break the line it lands in.
 */
export function CopyCommand({
  command,
  className,
  ...props
}: { command: string } & Omit<React.ComponentProps<"button">, "children">) {
  const { copy, isCopied } = useCopy();
  const copied = isCopied(command);

  return (
    <button
      type="button"
      onClick={() => void copy(command)}
      aria-label={`Copy ${command} to the clipboard`}
      className={cn(
        "group -mx-2 inline-flex items-center gap-2 rounded-md border border-transparent px-2 py-1 font-mono text-xs text-muted-foreground transition-all hover:text-foreground",
        focusRing,
        pressable,
        // after `pressable`, so it wins over its cursor-pointer
        "cursor-copy",
        className,
      )}
      {...props}
    >
      <span aria-hidden>~ {command}</span>

      {/* Always in the flow, only faded, so revealing it on hover cannot nudge
          the line. It stays lit while confirming, otherwise moving the mouse
          away right after the click would hide the only feedback there is. */}
      <span
        aria-hidden
        className={cn(
          "transition-opacity",
          copied
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
        )}
      >
        {copied ? (
          <Check className="size-3.5 text-foreground" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </span>

      <span aria-live="polite" className="sr-only">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </button>
  );
}
