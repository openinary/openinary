import posthog from "posthog-js";

// phc_ key is public by design — it ships in the client bundle either way
posthog.init("phc_kSWX2q7bTDJPoqv5oLWAYzShJ5u7kaqjgzAzeosShVzc", {
  api_host: "/ingest",
  ui_host: "https://eu.posthog.com",
  defaults: "2025-05-24",
});

// Forward data-track-event="name" (+ data-track-prop-*) clicks as named events
document.addEventListener(
  "click",
  (e) => {
    const el = (e.target as Element | null)?.closest?.("[data-track-event]");
    if (!(el instanceof HTMLElement) || !el.dataset.trackEvent) return;
    const props: Record<string, string> = {};
    for (const [k, v] of Object.entries(el.dataset)) {
      if (k.startsWith("trackProp") && v)
        props[k.slice("trackProp".length).toLowerCase()] = v;
    }
    posthog.capture(el.dataset.trackEvent, props);
  },
  { capture: true }
);
