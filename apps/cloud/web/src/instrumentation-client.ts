import posthog from "posthog-js";

// Same PostHog project as the marketing site; the phc_ key is public by
// design, it ships in the client bundle either way.
//
// Identity continuity: posthog-js keeps the anonymous distinct_id in a cookie
// on .openinary.dev (cross-subdomain by default), so a visitor who clicked
// through from openinary.dev arrives here as the same person. After sign-in,
// home.tsx calls posthog.identify(user.id), which merges that anonymous
// journey onto the account. The server captures cloud_account_created and
// asset_uploaded under the same user id (see apps/server/api/lib/analytics.ts),
// which is what makes the visit -> signup -> first upload funnel readable.
//
// capture_exceptions turns unhandled errors and promise rejections into
// $exception events (PostHog Error Tracking). Off by default, and its absence
// is why a customer's five-hour session left no trace of whatever broke on
// screen - the delivery logs only ever show what the CDN answered, never what
// the dashboard did with it.
//
// api_host is our own /ingest proxy (the rewrites in next.config.ts), not
// eu.i.posthog.com directly: blockers drop posthog.com requests, and this is
// the host where the entire product funnel and every $exception live. The
// distinct_id cookie is set on .openinary.dev whatever api_host is, so the
// cross-subdomain identity continuity described above is untouched.
//
// Local dev is muted, for the same reason and by the same hostname test as
// captureEvent in apps/cloud/server/api/lib/analytics.ts: `next dev` loads
// this file too, and localhost was outweighing production two to one on
// $pageview and ten to one on playground_opened. opt_out rather than skipping
// init, so the capture() calls in lib/analytics.ts stay no-ops instead of
// warning on every click. Preview deploys (*.workers.dev) are muted with it.
posthog.init("phc_kSWX2q7bTDJPoqv5oLWAYzShJ5u7kaqjgzAzeosShVzc", {
  api_host: "/ingest",
  ui_host: "https://eu.posthog.com",
  defaults: "2025-05-24",
  capture_exceptions: true,
  opt_out_capturing_by_default: !location.hostname.endsWith(".openinary.dev"),
});
