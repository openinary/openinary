"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "skullet/react";

import { useOnboarding } from "@/components/get-started/use-onboarding";
import { cn } from "@/lib/utils";

const ROW = "flex items-center gap-3 px-3 py-3";

export function Checklist() {
  const { steps, completed, total, isReady } = useOnboarding();

  // The steps are static, only their progress loads: the real list is
  // measured into the skeleton until it is known.
  return (
    <Skeleton loading={!isReady} label="Loading your progress">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-medium text-sm">Your first workflow</p>
          <p className="text-muted-foreground text-xs tabular-nums">
            {completed} of {total}
          </p>
        </div>
        <ol className="overflow-hidden rounded-lg border">
          {steps.map((step) => (
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
          ))}
        </ol>
      </div>
    </Skeleton>
  );
}
