"use client";

import { Check, ChevronDown, Copy } from "lucide-react";
import { useState } from "react";

import { AGENT_LOGOS } from "@/components/site/agent-logos";
import { focusRing } from "@/components/site/ui";
import { cn } from "@/lib/utils";

/**
 * The one-line prompt that has an AI agent set Openinary up. From the site we
 * don't know yet whether the visitor wants Cloud or self-hosted, so the page
 * it points to asks first (apps/docs/src/content/docs/agent-setup.mdx). The
 * dashboard has its own prompt that assumes Cloud.
 */
export const AGENT_PROMPT =
  "Set up Openinary for me. Follow the instructions at https://openinary.dev/docs/agent-setup/index.md";

export function AgentPrompt({
  surface,
  className,
}: {
  /** Where the prompt was copied from, e.g. "marketing_hero". */
  surface: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(AGENT_PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  // One button: the line and the card that floats over the page on hover are
  // both inside it, so a click anywhere on either copies. Nothing below moves.
  return (
    <button
      type="button"
      onClick={copy}
      data-track-event="agent_prompt_copied"
      data-track-prop-surface={surface}
      data-track-prop-prompt="generic"
      className={cn(
        "group relative inline-flex cursor-pointer items-center gap-1.5 rounded-[3px] text-left text-[13px] font-medium text-ink-12",
        focusRing,
        className,
      )}
    >
        <span className="flex -space-x-1" aria-hidden>
          {AGENT_LOGOS.map((logo) => (
            <span
              key={logo.name}
              title={logo.name}
              className="flex size-5 items-center justify-center rounded-full bg-ink-12 text-page ring-2 ring-page"
            >
              <svg viewBox="0 0 24 24" className="size-3" fill="currentColor">
                <path d={logo.path} />
              </svg>
            </span>
          ))}
        </span>
        <span className="ml-1">Set up with your agent</span>
        <ChevronDown className="size-3.5 text-ink-10 transition-transform group-hover:rotate-180 group-focus-visible:rotate-180" />

        {/* pt-2 bridges the gap, so moving the pointer down keeps it open. */}
        <span className="pointer-events-none absolute top-full left-0 z-20 w-[min(420px,calc(100vw-2rem))] pt-2 opacity-0 transition-[opacity,translate] duration-150 ease-out -translate-y-1 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:pointer-events-auto group-focus-visible:translate-y-0 group-focus-visible:opacity-100 motion-reduce:transition-none">
          <span
            className={cn(
              "block rounded-md border bg-page shadow-lg transition-colors duration-300",
              copied ? "border-emerald-600/50" : "border-ink-4",
            )}
          >
            <span className="block px-3.5 pt-3 pb-2.5 font-mono text-[12px] leading-5 font-normal text-ink-11">
              {AGENT_PROMPT}
            </span>
            {/* Both states share one grid cell: the old one leaves, then the
                new one comes in, so the line never reflows or overlaps. */}
            <span
              className={cn(
                "grid border-t px-3.5 py-2 text-[12px] font-normal transition-colors duration-300",
                copied ? "border-emerald-600/30 text-emerald-600" : "border-ink-4 text-ink-10",
              )}
            >
              <Swap on={!copied}>
                <Copy className="size-3.5" />
                Click to copy the prompt
              </Swap>
              <Swap on={copied}>
                <Check className="size-3.5" />
                Copied. Paste it into Claude Code, Codex or Cursor
              </Swap>
            </span>
          </span>
        </span>
        <span className="sr-only" role="status">
          {copied ? "Prompt copied" : ""}
        </span>
    </button>
  );
}

function Swap({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span
      aria-hidden={!on}
      className={cn(
        "col-start-1 row-start-1 flex items-center gap-1.5 transition-[opacity,translate,filter] ease-out motion-reduce:transition-none",
        on
          ? "translate-y-0 opacity-100 blur-0 delay-100 duration-200"
          : "pointer-events-none translate-y-1 opacity-0 blur-[2px] duration-100",
      )}
    >
      {children}
    </span>
  );
}
