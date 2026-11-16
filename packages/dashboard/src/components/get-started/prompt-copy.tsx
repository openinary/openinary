"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { useDashboard } from "../../adapter";
import { Button } from "../../ui/button";

/** Fixed width so swapping in "Copied" doesn't shift what sits next to it. */
export function CopyPromptButton() {
  const { useAiPrompt, analytics } = useDashboard();
  const content = useAiPrompt();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    analytics?.integrationPromptCopied("ai");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Button
      className="h-7 w-[112px] shrink-0 text-xs"
      disabled={!content}
      onClick={handleCopy}
      size="sm"
    >
      {copied ? (
        <>
          <Check className="size-3.5" />
          Copied
        </>
      ) : (
        <>
          <Copy className="size-3.5" />
          Copy prompt
        </>
      )}
    </Button>
  );
}
