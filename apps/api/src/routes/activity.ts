import { Hono } from "hono";

import { activityLog } from "../config/activity";
import { LOG_LIMIT } from "../utils/activity-log";

/** What the dashboard's Usage page and Get started checklist read. */
const activity = new Hono();

// The chart's longest period is 30 days; older counts stay for later.
const COUNTS_WINDOW_MS = 30 * 24 * 3_600_000;

activity.get("/", (c) =>
  c.json({
    deliveries: activityLog.deliveries(),
    /** How many deliveries the log keeps, so the dashboard can say so. */
    limit: LOG_LIMIT,
    counts: activityLog.counts(Date.now() - COUNTS_WINDOW_MS),
  }),
);

activity.get("/onboarding", (c) =>
  c.json({
    uploaded: activityLog.apiUploadSeen(),
    delivered: activityLog.hasDelivered(),
  }),
);

export default activity;
