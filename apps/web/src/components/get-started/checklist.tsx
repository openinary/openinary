"use client";

import { Check } from "lucide-react";
import Link from "next/link";

import { useOnboarding } from "@/components/get-started/use-onboarding";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Shared by the real row and its skeleton so the two are the same box: the
 * bullet is size-5, the title's line box 20px and the description's 16px, which
 * the skeleton mirrors with h-5/h-4 wrappers rather than by guessing a height.
 */
const ROW = "flex items-center gap-3 px-3 py-3";

export function Checklist() {
  const { steps, completed, total, isReady } = useOnboarding();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-medium text-sm">Your first workflow</p>
        {isReady ? (
          <p className="text-muted-foreground text-xs tabular-nums">
            {completed} of {total}
          </p>
        ) : (
          <Skeleton className="h-4 w-10" />
        )}
      </div>
      <ol className="overflow-hidden rounded-lg border">
        {isReady
          ? steps.map((step) => (
              <li key={step.id} className="border-b last:border-0">
                <Link
                  href={step.href}
                  className={cn(ROW, "transition-colors hover:bg-muted/50")}
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border",
                      step.done &&
                        "border-transparent bg-primary text-primary-foreground",
                    )}
                  >
                    {step.done && <Check className="size-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block font-medium text-sm",
                        step.done && "text-muted-foreground line-through",
                      )}
                    >
                      {step.title}
                    </span>
                    <span className="block text-muted-foreground text-xs">
                      {step.description}
                    </span>
                  </span>
                </Link>
              </li>
            ))
          : Array.from({ length: 3 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton
              <li key={i} className="border-b last:border-0">
                <div className={ROW}>
                  <Skeleton className="size-5 shrink-0 rounded-full" />
                  <span className="min-w-0 flex-1">
                    <span className="flex h-5 items-center">
                      <Skeleton className="h-3.5 w-44" />
                    </span>
                    <span className="flex h-4 items-center">
                      <Skeleton className="h-3 w-64 max-w-full" />
                    </span>
                  </span>
                </div>
              </li>
            ))}
      </ol>
    </div>
  );
}
