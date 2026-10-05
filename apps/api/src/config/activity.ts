import { db } from "shared/auth";
import { ActivityLog } from "../utils/activity-log";

// Same database as the accounts and the video queue: one thing to back up,
// and the log survives a restart. `db` is the lazy Proxy from shared/auth —
// safe to hold at import time; methods throw until initDb() has run, and
// ActivityLog touches nothing at construction.
export const activityLog = new ActivityLog(db);
