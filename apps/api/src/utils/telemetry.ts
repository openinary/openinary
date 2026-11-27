import os from "os";
import {
  bucketCount,
  getDatabase,
  kvGet,
  kvInit,
  kvSet,
  readVersion,
  type TelemetryEvent,
} from "shared";
import { logger } from "@openinary/core";
import { getStorageConfigFromEnv } from "../config/storage";
import { deploymentMode } from "../config/mode";
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
 * (telemetry.openinary.dev, apps/telemetry) that holds the real PostHog key,
 * validates the payload against the schema in @openinary/telemetry-schema, and
 * rate-limits per instance.
 */

const TELEMETRY_ENDPOINT =
  process.env.TELEMETRY_ENDPOINT || "https://telemetry.openinary.dev/collect";
/** Also read by the onboarding form, which says where its answers go. */
export const telemetryEnabled = process.env.OPENINARY_TELEMETRY !== "false";
const HEARTBEAT_INTERVAL_MS = 24 * 60 * 60 * 1000;
// Spreads the first heartbeat over an hour so a fleet restart is not one spike.
const HEARTBEAT_JITTER_MS = 60 * 60 * 1000;
const SEND_TIMEOUT_MS = 3000;

async function getOrCreateInstanceId(): Promise<string> {
  const db = await getDatabase();
  const existing = await kvGet(db, "instance_id");
  if (existing) return existing;
  // Derived from BETTER_AUTH_SECRET when possible: the secret lives in the
  // deployment env, so the id survives DB wipes and volume-less redeploys.
  const secret = process.env.BETTER_AUTH_SECRET;
  const id = canDeriveFrom(secret) ? deriveInstanceId(secret) : crypto.randomUUID();
  // Nodes sharing a Postgres may race here: the first id stored wins.
  return kvInit(db, "instance_id", id);
}

async function getVideoJobCount(): Promise<number> {
  try {
    const row = await (await getDatabase())
      .selectFrom("video_jobs")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .executeTakeFirst();
    return Number(row?.count ?? 0);
  } catch {
    return 0;
  }
}

async function send(instanceId: string, payload: TelemetryEvent) {
  if (!telemetryEnabled) return;

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
    version: readVersion() ?? "unknown",
    deployment_mode: deploymentMode(),
    storage_backend: getStorageConfigFromEnv().config.bucketName
      ? ("s3" as const)
      : ("local" as const),
  };
}

async function sendHeartbeat(instanceId: string) {
  await send(instanceId, {
    event: "daily_heartbeat",
    properties: {
      ...buildBaseProperties(),
      video_jobs_bucket: bucketCount(await getVideoJobCount()),
    },
  });
  await kvSet(await getDatabase(), "last_heartbeat_at", Date.now().toString());
}

/**
 * The first-run questionnaire's multiple-choice answers: option ids only,
 * never the name, workspace or pictures typed alongside them. Once per user,
 * when they finish it.
 */
export async function trackOnboardingCompleted(properties: {
  role: string;
  use_cases: string[];
  source: string | null;
}) {
  if (!telemetryEnabled) return;
  try {
    await send(await getOrCreateInstanceId(), {
      event: "onboarding_completed",
      properties: { ...properties, source: properties.source ?? "skipped" },
    });
  } catch (error) {
    logger.debug({ error }, "Telemetry send failed (ignored)");
  }
}

/**
 * Fires `instance_started` once ever, then a `daily_heartbeat` roughly every
 * 24h for the lifetime of the process.
 */
export async function initTelemetry(): Promise<void> {
  if (!telemetryEnabled) {
    logger.info("Telemetry disabled (OPENINARY_TELEMETRY=false)");
    return;
  }

  try {
    const db = await getDatabase();
    const instanceId = await getOrCreateInstanceId();

    // Stored only if absent, so of several nodes booting on one Postgres
    // only the one whose value stuck reports the first start.
    const startedAt = Date.now().toString();
    if ((await kvInit(db, "first_started_at", startedAt)) === startedAt) {
      void send(instanceId, {
        event: "instance_started",
        properties: {
          ...buildBaseProperties(),
          os_platform: os.platform(),
          os_arch: os.arch(),
          node_version: process.version,
        },
      });
    }

    // Only the first send is jittered; the steady-state period stays exact so
    // a live instance never drifts out of a rolling 24h "active" window.
    const lastHeartbeatAt = Number((await kvGet(db, "last_heartbeat_at")) || 0);
    const dueIn = Math.max(
      0,
      HEARTBEAT_INTERVAL_MS - (Date.now() - lastHeartbeatAt),
    );
    const jitter = Math.floor(Math.random() * HEARTBEAT_JITTER_MS);

    const heartbeat = () => {
      sendHeartbeat(instanceId).catch((error) => {
        logger.debug({ error }, "Telemetry heartbeat failed (ignored)");
      });
    };
    setTimeout(() => {
      heartbeat();
      setInterval(heartbeat, HEARTBEAT_INTERVAL_MS).unref();
    }, dueIn + jitter).unref();

    logger.info({ instanceId }, "Telemetry initialized");
  } catch (error) {
    // e.g. a read-only database
    logger.debug({ error }, "Telemetry init failed (ignored)");
  }
}
