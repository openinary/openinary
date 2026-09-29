import { Hono } from "hono";

import { activityLog } from "../config/activity";

/** What the dashboard's Usage page and Get started checklist read. */
const activity = new Hono();

activity.get("/", (c) => c.json({ deliveries: activityLog.deliveries() }));

activity.get("/onboarding", (c) =>
  c.json({
    uploaded: activityLog.apiUploadSeen(),
    delivered: activityLog.hasDelivered(),
  }),
);

export default activity;
