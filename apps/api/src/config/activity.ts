import { db } from "shared/auth";
import { ActivityLog } from "../utils/activity-log";

// Same database file as the accounts and the video queue: one thing to back
// up, and the log survives a restart.
export const activityLog = new ActivityLog(db);
