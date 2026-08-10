import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

// Shared by both the Worker (per-request isolate) and the MediaContainer
// (long-lived Node process, now only mirroring video_job rows) - neon-http
// talks HTTPS to Neon's SQL-over-HTTP proxy per query, which is the only
// option available inside a Worker isolate (no TCP), and is fine for the
// container's now-low query volume too. DATABASE_URL is Neon's direct
// endpoint; there's no separate pooled connection string to splice in here.
export const db = drizzle(neon(process.env.DATABASE_URL || ""));
