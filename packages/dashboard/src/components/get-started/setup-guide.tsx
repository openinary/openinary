"use client";

import { cn } from "@openinary/ui/server";
import { ArrowRight, Check, X } from "lucide-react";
import { Popover } from "radix-ui";
import { useState } from "react";
import { Skeleton } from "skullet/react";

import { useDashboard } from "../../adapter";
import { useHydrated } from "../../hooks/use-hydrated";
import { CircularProgress } from "../../ui/circular-progress";

import { useOnboarding } from "./use-onboarding";

/**
 * The setup guide, at the foot of the sidebar until every step is done: a row
 * with progress as a ring, which opens a card listing the steps. Only
 * the next one shows what to do and where; the rest is one line each.
 */
export function SetupGuide() {
  const { isReady } = useOnboarding();
  // Client-only, so the skeleton can recall its last shape (useHydrated).
  if (!useHydrated()) return null;
  // Mounted from the first paint: skullet remembers whether the row showed
  // last time under this id, so the slot keeps its height (or none, once
  // setup is done) while progress loads, instead of the row popping in.
  return (
    <Skeleton id="setup-guide" loading={!isReady} label="Loading your progress">
      <SetupGuideRow />
    </Skeleton>
  );
}

function SetupGuideRow() {
  const { Link } = useDashboard();
  const { steps, completed, total, isComplete } = useOnboarding();
  const [open, setOpen] = useState(false);
  if (isComplete) return null;
  const next = steps.findIndex((step) => !step.done);
  const progress = (completed / total) * 100;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label="Setup guide"
        className="flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 text-[13px]/5 text-ds-secondary outline-none ring-1 ring-ds-border transition-colors hover:bg-ds-hover hover:text-ds-text focus-visible:outline-2 focus-visible:outline-ds-ring data-[state=open]:bg-ds-hover data-[state=open]:text-ds-text group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:ring-0"
      >
        <CircularProgress
          value={progress}
          size={14}
          thickness={2}
          className="mi-grow shrink-0 text-ds-blue"
        />
        <span className="flex-1 truncate text-left group-data-[collapsible=icon]:hidden">
          Setup guide
        </span>
        <span className="text-ds-faint text-xs tabular-nums group-data-[collapsible=icon]:hidden">
          {completed}/{total}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="right"
          align="end"
          sideOffset={8}
          collisionPadding={8}
          className="ds-modal data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-left-2 z-50 w-[min(300px,calc(100vw-1rem))] rounded-[14px]! text-ds-text outline-none duration-200 data-[state=closed]:animate-out data-[state=open]:animate-in"
        >
          <div className="flex items-center gap-3 px-4 pt-4 pb-3">
            <CircularProgress
              value={progress}
              size={28}
              thickness={3}
              className="shrink-0 text-ds-blue"
            />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[14px]/5">Get set up</p>
              <p className="text-[12.5px]/[18px] text-ds-muted tabular-nums">
                {completed} of {total} done
              </p>
            </div>
            <Popover.Close
              aria-label="Close the guide"
              className="-mr-1.5 flex size-7 cursor-pointer items-center justify-center rounded-[8px] text-ds-muted outline-none transition-colors hover:bg-ds-hover hover:text-ds-text focus-visible:outline-2 focus-visible:outline-ds-ring"
            >
              <X className="mi-close size-4" />
            </Popover.Close>
          </div>
          <ol className="border-ds-divider border-t py-1.5">
            {steps.map((step, index) => {
              const current = index === next;
              return (
                <li key={step.id}>
                  <Link
                    href={step.href}
                    onClick={() => setOpen(false)}
                    className="flex gap-2.5 px-4 py-2 transition-colors hover:bg-ds-row-hover"
                  >
                    <span
                      className={cn(
                        "mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full font-medium text-[10.5px]/none tabular-nums",
                        step.done && "bg-ds-active text-ds-muted",
                        current && "bg-ds-inverse text-ds-inverse-text",
                        !step.done &&
                          !current &&
                          "text-ds-faint inset-ring inset-ring-ds-border-strong",
                      )}
                    >
                      {step.done ? (
                        <Check className="size-2.5" strokeWidth={2.6} />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "flex items-center gap-1 text-[13px]/5",
                          current && "font-medium",
                          step.done && "text-ds-faint",
                          !step.done && !current && "text-ds-muted",
                        )}
                      >
                        {step.title}
                        {current && (
                          <ArrowRight className="mi-arrow ml-auto size-3.5 text-ds-faint" />
                        )}
                      </span>
                      {current && (
                        <span className="mt-0.5 block text-[12.5px]/[18px] text-ds-muted text-pretty">
                          {step.description}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
