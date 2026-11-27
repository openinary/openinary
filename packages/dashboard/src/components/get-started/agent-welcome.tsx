"use client";

import { ArrowRight, Check, Copy } from "lucide-react";
import { useState } from "react";

import { useDashboard } from "../../adapter";
import { useDocumentTitle } from "../../hooks/use-document-title";

const STEPS = [
  ["Connect the MCP", "Your agent adds Openinary to its tools."],
  ["Sign in once", "No API key in the chat."],
  ["Your project is wired", "Uploads and delivery, in your code."],
] as const;

/**
 * Home's first screen on Cloud: one prompt that has the user's coding agent
 * connect the Openinary MCP server and set the project up through it. Shown
 * until the checklist is done or the user skips to the dashboard.
 */
export function AgentWelcome({
  firstName,
  prompt,
  onSkip,
}: {
  firstName: string | undefined;
  prompt: string;
  onSkip: () => void;
}) {
  const { Link, analytics } = useDashboard();
  const [copied, setCopied] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  useDocumentTitle("Home");

  const copy = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    analytics?.integrationPromptCopied("agent");
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="flex justify-center px-4 pt-16 pb-12 sm:px-8 md:pt-32">
      <div className="flex w-full max-w-[560px] flex-col">
        <p className="mb-2.5 text-[13px]/5 text-ds-muted">
          Welcome to Openinary Cloud
        </p>
        <h1 className="font-semibold text-[28px]/9 tracking-[-0.01em]">
          {firstName ? `Hey ${firstName} 👋` : "Hey there 👋"}
          <br />
          <span className="font-medium text-ds-muted">
            Let your agent do the setup.
          </span>
        </h1>
        <p className="mt-3.5 text-pretty text-[14px]/5 text-ds-muted">
          Paste one prompt into Claude Code, Cursor, Codex or any MCP client.
          It connects to Openinary, you sign in once, and it wires uploads and
          delivery into the project you have open.
        </p>

        <div className="mt-7 flex items-center gap-4">
          <button
            type="button"
            onClick={copy}
            className={`flex h-11 flex-1 items-center justify-between rounded-[10px] border bg-ds-field pr-1.5 pl-3.5 text-left outline-none transition-[border-color,box-shadow] focus-visible:outline-2 focus-visible:outline-ds-ring ${
              copied
                ? "border-ds-green shadow-[0_0_0_3px_rgb(21_128_61/0.12)]"
                : "border-ds-accent shadow-[0_0_0_3px_rgb(59_123_255/0.14)]"
            }`}
          >
            <span className="font-medium text-[13.5px]/5">
              {copied
                ? "Copied. Paste it into your agent"
                : "Copy agent setup prompt"}
            </span>
            <span className="flex size-8 items-center justify-center rounded-[8px] border border-(--ds-accent-edge) bg-ds-accent text-white">
              {copied ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </span>
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={showPrompt}
            onClick={() => setShowPrompt((v) => !v)}
            className="flex h-11 shrink-0 items-center gap-2 text-[13px]/5 text-ds-secondary"
          >
            <span
              className={`flex h-[18px] w-[30px] rounded-full p-0.5 transition-colors ${
                showPrompt
                  ? "justify-end bg-ds-inverse"
                  : "justify-start bg-ds-border-strong"
              }`}
            >
              <span className="size-3.5 rounded-full bg-white shadow-sm" />
            </span>
            Show prompt
          </button>
        </div>

        {showPrompt && (
          <pre className="mt-2.5 max-h-60 overflow-auto whitespace-pre-wrap rounded-[10px] border bg-ds-code px-4 py-3.5 font-mono text-[11px]/[18px] text-ds-secondary">
            {prompt}
          </pre>
        )}

        <div className="mt-9 flex gap-6 border-t pt-5">
          {STEPS.map(([title, body], i) => (
            <div key={title} className="flex flex-1 flex-col gap-1">
              <span className="font-mono text-[11px] text-ds-faint">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="font-medium text-[13px]/5">{title}</span>
              <span className="text-[12.5px]/5 text-ds-muted">{body}</span>
            </div>
          ))}
        </div>

        <div className="mt-8 flex items-center justify-between text-[13px]/5 text-ds-muted">
          <span>
            Rather do it by hand?{" "}
            <Link
              href="/get-started/integrate"
              className="text-ds-secondary underline underline-offset-2 hover:text-ds-text"
            >
              Integration guide
            </Link>
          </span>
          <button
            type="button"
            onClick={onSkip}
            className="inline-flex items-center gap-1.5 text-ds-secondary hover:text-ds-text"
          >
            Skip to dashboard
            <ArrowRight className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
