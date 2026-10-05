"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { aiPrompt } from "@/components/get-started/integration-snippets";
import { Button } from "@/components/ui/button";
import { useDeliveryBase } from "@/hooks/use-delivery-base";

/**
 * Shared by the uploader card's primary CTA and /get-started/integrate, so the
 * two copy the same thing. Prefilled with this instance's API URL.
 */
export function useAiPrompt() {
  return aiPrompt({ apiBaseUrl: useDeliveryBase() });
}

/** Fixed width so swapping in "Copied" doesn't shift what sits next to it. */
export function CopyPromptButton() {
  const content = useAiPrompt();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
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
