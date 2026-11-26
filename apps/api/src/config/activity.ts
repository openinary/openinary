import { getDatabase } from "shared";
import { ActivityLog } from "../utils/activity-log";

// In the instance database: one file to back up (or the shared Postgres),
// and it survives a restart.
export const activityLog = new ActivityLog(getDatabase);
