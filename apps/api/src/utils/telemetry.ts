import os from "os";
import fs from "fs";
import { db } from "shared/auth";
import { logger } from "@openinary/core";
import { getStorageConfigFromEnv } from "../config/storage";
import { canDeriveFrom, deriveInstanceId } from "./telemetry-id";

/**
 * Anonymous usage telemetry.
 *
 * What this sends and why: see /docs/configuration/telemetry.mdx.
 * - No PII, no file names, no media content, no IPs are collected here.
 * - Every property is bucketed/enumerated, never a raw count or free-text value.
 * - Disable entirely with OPENINARY_TELEMETRY=false.
 *
 * Events are NOT sent directly to PostHog. They go through a small proxy
 * (telemetry.openinary.dev) that holds the real PostHog key, validates the
 * payload against this same whitelist, and rate-limits per instance.
 */

const TELEMETRY_ENDPOINT =
  process.env.TELEMETRY_ENDPOINT || "https://telemetry.openinary.dev/collect";
const TELEMETRY_ENABLED = process.env.OPENINARY_TELEMETRY !== "false";
const HEARTBEAT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h
const HEARTBEAT_JITTER_MS = 60 * 60 * 1000; // boot-time spread of up to 1h, avoids thundering herd
const SEND_TIMEOUT_MS = 3000;

type CountBucket = "0" | "1-10" | "11-100" | "101-1000" | "1000+";

function bucketCount(n: number): CountBucket {
  if (n <= 0) return "0";
  if (n <= 10) return "1-10";
  if (n <= 100) return "11-100";
  if (n <= 1000) return "101-1000";
  return "1000+";
}

function ensureTelemetryTable() {
  db.exec(
    `CREATE TABLE IF NOT EXISTS _telemetry_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  );
}

function getConfig(key: string): string | undefined {
  const row = db
    .prepare("SELECT value FROM _telemetry_config WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value;
}

function setConfig(key: string, value: string) {
  db.prepare(
    "INSERT INTO _telemetry_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

function getOrCreateInstanceId(): string {
  const existing = getConfig("instance_id");
  if (existing) return existing;
  // Prefer an id derived from BETTER_AUTH_SECRET (salted one-way hash): the
  // secret lives in the deployment env, so the id survives DB wipes and
  // redeploys without a volume. Random UUID otherwise (dev, placeholder secret).
  const secret = process.env.BETTER_AUTH_SECRET;
  const id = canDeriveFrom(secret) ? deriveInstanceId(secret) : crypto.randomUUID();
  setConfig("instance_id", id);
  return id;
}

function getVersion(): string {
  // /app/version.txt is baked at image build time and always holds the real
  // build version (a :latest release image still says v1.2.3), so it wins
  // over the IMAGE_TAG env var, which is user config and often just "latest".
  // Neither exists when running from source → "unknown".
  try {
    const baked = fs.readFileSync("/app/version.txt", "utf8").trim();
    if (baked) return baked;
  } catch {
    // not a docker image
  }
  return process.env.IMAGE_TAG || "unknown";
}

function getDeploymentMode(): string {
  return process.env.MODE || "fullstack";
}

function getStorageBackend(): "s3" | "local" {
  // Same STORAGE_* env resolution the app itself uses. (The old check looked
  // at S3_BUCKET/AWS_S3_BUCKET, which nothing sets — it reported "local" even
  // for instances running on S3-compatible storage.)
  return getStorageConfigFromEnv().config.bucketName ? "s3" : "local";
}

function getVideoJobCount(): number {
  try {
    const row = db.prepare("SELECT COUNT(*) as count FROM video_jobs").get() as
      | { count: number }
      | undefined;
    return row?.count ?? 0;
  } catch {
    return 0;
  }
}

// Whitelist of every event this codebase is allowed to emit, and the exact
// property shape each one carries. Keep this in sync with the proxy's schema.
type TelemetryEvent =
  | {
      event: "instance_started";
      properties: {
        version: string;
        deployment_mode: string;
        storage_backend: "s3" | "local";
        os_platform: string;
        os_arch: string;
        node_version: string;
      };
    }
  | {
      event: "daily_heartbeat";
      properties: {
        version: string;
        deployment_mode: string;
        storage_backend: "s3" | "local";
        video_jobs_bucket: CountBucket;
      };
    };

async function send(instanceId: string, payload: TelemetryEvent) {
  if (!TELEMETRY_ENABLED) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    await fetch(TELEMETRY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instance_id: instanceId,
        event: payload.event,
        properties: payload.properties,
        timestamp: new Date().toISOString(),
      }),
      signal: controller.signal,
    });
  } catch (error) {
    // Telemetry must never affect the running instance.
    logger.debug({ error }, "Telemetry send failed (ignored)");
  } finally {
    clearTimeout(timeout);
  }
}

function buildBaseProperties() {
  return {
    version: getVersion(),
    deployment_mode: getDeploymentMode(),
    storage_backend: getStorageBackend(),
  };
}

async function sendHeartbeat(instanceId: string) {
  await send(instanceId, {
    event: "daily_heartbeat",
    properties: {
      ...buildBaseProperties(),
      video_jobs_bucket: bucketCount(getVideoJobCount()),
    },
  });
  setConfig("last_heartbeat_at", Date.now().toString());
}

/**
 * Starts anonymous telemetry: fires `instance_started` once ever, then a
 * `daily_heartbeat` roughly every 24h for the lifetime of the process.
 * No-op (besides logging) if OPENINARY_TELEMETRY=false.
 */
export function initTelemetry() {
  if (!TELEMETRY_ENABLED) {
    logger.info("Telemetry disabled (OPENINARY_TELEMETRY=false)");
    return;
  }

  try {
    ensureTelemetryTable();
    const instanceId = getOrCreateInstanceId();

    if (!getConfig("first_started_at")) {
      setConfig("first_started_at", Date.now().toString());
      send(instanceId, {
        event: "instance_started",
        properties: {
          ...buildBaseProperties(),
          os_platform: os.platform(),
          os_arch: os.arch(),
          node_version: process.version,
        },
      });
    }

    // Send a heartbeat if the last one is missing or older than the interval,
    // then keep sending every 24h for as long as the process runs. Only the
    // first send is jittered (thundering-herd protection); the steady-state
    // period stays exact so a live instance never drifts out of a rolling
    // 24h "active instances" window.
    const lastHeartbeatAt = Number(getConfig("last_heartbeat_at") || 0);
    const dueIn = Math.max(
      0,
      HEARTBEAT_INTERVAL_MS - (Date.now() - lastHeartbeatAt),
    );
    const jitter = Math.floor(Math.random() * HEARTBEAT_JITTER_MS);

    setTimeout(() => {
      sendHeartbeat(instanceId);
      setInterval(() => {
        sendHeartbeat(instanceId);
      }, HEARTBEAT_INTERVAL_MS).unref();
    }, dueIn + jitter).unref();

    logger.info({ instanceId }, "Telemetry initialized");
  } catch (error) {
    // Telemetry must never take the instance down (e.g. read-only DB).
    logger.debug({ error }, "Telemetry init failed (ignored)");
  }
}
