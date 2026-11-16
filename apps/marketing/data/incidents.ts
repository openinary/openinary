import type { Incident } from "../lib/status";

/**
 * Every incident shown on /status, newest first. Merging to main deploys the
 * site, so posting an update is a commit. An incident stays "active" (and
 * colours the banner and footer) until it has an update with status
 * "resolved". Components: api, delivery, processing, dashboard, website.
 * Impacts: maintenance, degraded, partial, major.
 *
 * {
 *   id: "2026-11-16-slow-uploads",
 *   title: "Slow uploads",
 *   impact: "degraded",
 *   components: ["api"],
 *   updates: [
 *     { at: "2026-11-16T15:10:00Z", status: "resolved", body: "Uploads are back to normal speed." },
 *     { at: "2026-11-16T14:05:00Z", status: "investigating", body: "Uploads take longer than usual. We're looking into it." },
 *   ],
 * },
 */
export const incidents: Incident[] = [];
