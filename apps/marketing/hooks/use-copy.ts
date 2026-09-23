"use client";

import * as React from "react";

/**
 * Clipboard write with a self-clearing "copied" flag.
 *
 * Keyed so one hook can back several buttons: pass a key per button and read
 * it back with `isCopied`. Where there is only one button, the copied text
 * doubles as the key.
 */
export function useCopy(resetAfterMs = 1600) {
  const [copied, setCopied] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(null), resetAfterMs);
    return () => clearTimeout(id);
  }, [copied, resetAfterMs]);

  const copy = React.useCallback(async (text: string, key = text) => {
    // Absent on insecure origins, and writeText rejects when the page is not
    // focused or permission is denied. Swallowing it leaves the button in its
    // idle state, which is honest: nothing was copied, so nothing confirms.
    if (!navigator.clipboard) return false;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    copied,
    copy,
    isCopied: React.useCallback((key: string) => copied === key, [copied]),
  };
}
