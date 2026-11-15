"use client";

import { buttonVariants } from "@openinary/ui";
import { cn } from "@openinary/ui/server";
import { ArrowRight, Check } from "lucide-react";
import { Skeleton } from "skullet/react";

import { useDashboard } from "../../adapter";

import { useOnboarding } from "./use-onboarding";

const MARK =
  "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px]/none font-medium tabular-nums";

/**
 * The setup checklist. Done steps fold to one faint line, the next one opens
 * with what to do and a button that does it, later ones wait as a number.
 * Progress comes from what the user's app has really done, not from clicks.
 */
export function Checklist() {
  const { Link } = useDashboard();
  const { steps, completed, total, isReady } = useOnboarding();
  const next = steps.findIndex((step) => !step.done);

  // The steps are static, only their progress loads: the real list is
  // measured into the skeleton until it is known.
  return (
    <Skeleton loading={!isReady} label="Loading your progress">
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2 px-1 text-[13px]/5">
          <h2 className="font-medium">Get set up</h2>
          <span className="text-ds-faint tabular-nums">
            {completed} of {total}
          </span>
        </div>
        <ol className="ds-tile ds-tile-rows">
          {steps.map((step, index) => {
            const current = index === next;
            return (
              <li key={step.id} className="ds-tile-row">
                <Link
                  href={step.href}
                  className={cn(
                    "flex gap-3 px-4 transition-colors hover:bg-ds-row-hover",
                    current ? "items-start py-3.5" : "h-11 items-center",
                  )}
                >
                  <span
                    className={cn(
                      MARK,
                      step.done && "bg-ds-active text-ds-muted",
                      current && "bg-ds-inverse text-ds-inverse-text",
                      !step.done &&
                        !current &&
                        "text-ds-faint inset-ring inset-ring-ds-border-strong",
                    )}
                  >
                    {step.done ? (
                      <Check className="mi-pop size-3" strokeWidth={2.4} />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block text-[13.5px]/5",
                        current && "font-medium",
                        step.done && "text-ds-faint",
                        !step.done && !current && "text-ds-muted",
                      )}
                    >
                      {step.title}
                    </span>
                    {current && (
                      <>
                        <span className="mt-0.5 block text-[13px]/5 text-ds-muted text-pretty">
                          {step.description}
                        </span>
                        <span
                          className={cn(
                            buttonVariants({ size: "xs" }),
                            "mt-3",
                          )}
                        >
                          {step.action}
                          <ArrowRight className="mi-arrow" />
                        </span>
                        {step.waiting && (
                          <span
                            aria-live="polite"
                            className="ds-pill ds-pill-blue mt-3 ml-2 align-middle"
                          >
                            <span className="mi-spin size-2.5 rounded-full border-[1.5px] border-current border-t-transparent" />
                            {step.waiting}
                          </span>
                        )}
                      </>
                    )}
                  </span>
                  {step.done && (
                    <span className="text-[12.5px]/4 text-ds-faint">Done</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ol>
      </section>
    </Skeleton>
  );
}
