"use client";

import { useEffect, useRef } from "react";

// Public site key - unset means no widget and no server-side check either
// (the captcha plugin is gated on TURNSTILE_SECRET_KEY, see server auth.ts).
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

type Turnstile = {
  render: (
    el: HTMLElement,
    opts: { sitekey: string; callback: (token: string) => void },
  ) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

// Turnstile hands its token to a callback, whenever it happens to be done -
// right away for a silent pass, or minutes later behind a challenge. A promise
// lets the submit handler simply await it. Tokens are single-use, so a fresh
// one is created on every reset.
function pendingToken() {
  return Promise.withResolvers<string>();
}

/**
 * Renders a Cloudflare Turnstile widget and produces the header Better Auth's
 * captcha plugin expects.
 */
export function useTurnstile() {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string>(undefined);
  const token = useRef(pendingToken());

  // Explicit render (not the `cf-turnstile` class auto-scan): the script is
  // only parsed once per document, so a client-side nav back to this form
  // would otherwise land on an empty widget slot.
  useEffect(() => {
    const el = containerRef.current;
    if (!SITE_KEY || !el) return;

    const render = () => {
      widgetId.current = window.turnstile?.render(el, {
        sitekey: SITE_KEY,
        callback: (t) => token.current.resolve(t),
      });
    };

    if (window.turnstile) {
      render();
    } else {
      const script = document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      // Without this, anything Turnstile throws reaches window.onerror as the
      // bare string "Script error." with no message, no file and no stack -
      // the browser withholds the detail because the script came from another
      // origin. It is the only cross-origin script tag the app injects, so it
      // is also the only one that can produce that. challenges.cloudflare.com
      // answers `access-control-allow-origin: *` on both the 302 and the file
      // behind it, so the load itself is unaffected.
      script.crossOrigin = "anonymous";
      script.async = true;
      script.onload = render;
      document.head.appendChild(script);
    }

    return () => {
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
    };
  }, []);

  const reset = () => {
    token.current = pendingToken();
    if (widgetId.current) window.turnstile?.reset(widgetId.current);
  };

  return {
    containerRef,
    reset,
    /**
     * Auth request headers: `{}` when Turnstile is off, `null` when no token
     * showed up in time (visitor ignored the challenge, or it failed).
     */
    async headers(timeoutMs = 60_000) {
      if (!SITE_KEY) return {};
      const t = await Promise.race([
        token.current.promise,
        new Promise<null>((r) => setTimeout(() => r(null), timeoutMs)),
      ]);
      return t ? { "x-captcha-response": t } : null;
    },
  };
}
