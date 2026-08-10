"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { aiPrompt } from "@/components/get-started/integration-snippets";
import { Button } from "@/components/ui/button";
import { trackIntegrationPromptCopied } from "@/lib/analytics";
import { orpc } from "@/utils/orpc";

/**
 * Shared by the uploader card's primary CTA and /get-started/integrate, so the
 * two copy the same thing. null until the bucket list lands - the prompt is
 * prefilled with it.
 */
export function useAiPrompt() {
  const { data: buckets } = useQuery(orpc.bucket.list.queryOptions());

  const bucket = buckets?.find((b) => b.active) ?? buckets?.[0];
  const apiBaseUrl = process.env.NEXT_PUBLIC_SERVER_URL ?? "";

  return bucket
    ? aiPrompt({
        apiBaseUrl,
        cdnBaseUrl: `${apiBaseUrl}/b/${bucket.id}`,
        bucketId: bucket.id,
      })
    : null;
}

/** Fixed width so swapping in "Copied" doesn't shift what sits next to it. */
export function CopyPromptButton() {
  const content = useAiPrompt();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    trackIntegrationPromptCopied("ai");
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
