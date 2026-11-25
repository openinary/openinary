// Opt-in OpenTelemetry export of deliveries: counters and a duration histogram
// for dashboards, and one log record per request for anyone who wants the
// URL and transformation behind those numbers.
//
// Off unless an OTLP endpoint is configured with the standard OTEL_* variables,
// and the SDK is only loaded then, so a default install pays nothing for it.
// It speaks plain OTLP/HTTP, so where the data goes (a Collector, Grafana,
// Datadog, ClickHouse, ...) is decided outside this codebase.
//
// What it sends and how to point it somewhere: docs/configuration/opentelemetry.

import type { Counter, Histogram } from "@opentelemetry/api";
import type { Logger } from "@opentelemetry/api-logs";
import type { LogRecordExporter } from "@opentelemetry/sdk-logs";
import type { PushMetricExporter } from "@opentelemetry/sdk-metrics";
import { logger, serializeError, type TransformOutcome } from "@openinary/core";
import { splitTransformPath } from "@openinary/core/url";
import { readVersion } from "shared";
import { type DeliveryKind, deliveryKind } from "./activity-log";

export type DeliveryRoute = "t" | "authenticated";

export type Delivery = {
  route: DeliveryRoute;
  /** Decoded path below the route's mount, signature segment included. */
  path: string;
  method: string;
  status: number;
  /** How the transform route served it; undefined on errors and 429s. */
  outcome?: TransformOutcome;
  durationMs: number;
  /** The dashboard showing an asset to its owner rather than the public. */
  dashboard: boolean;
};

// A real nested path with a transformation in front of it fits; a pathological
// one does not get to make every log row huge.
const PATH_MAX = 512;

type Instruments = {
  requests: Counter;
  transforms: Counter;
  duration: Histogram;
  /** Null when OPENINARY_OTEL_DELIVERY_LOGS=false. */
  log: Logger | null;
  shutdown: () => Promise<void>;
  flush: () => Promise<void>;
};

let instruments: Instruments | null = null;

/**
 * Whether an OTLP destination is configured. Same variables the SDK reads, so
 * nothing here is Openinary-specific; OTEL_SDK_DISABLED wins over all of them.
 */
export function otelConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.OTEL_SDK_DISABLED?.toLowerCase() === "true") return false;
  return !!(
    env.OTEL_EXPORTER_OTLP_ENDPOINT ||
    env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT ||
    env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT
  );
}

export type OtelOptions = {
  /** Tests pass in-memory exporters; production uses OTLP/HTTP. */
  metricExporter?: PushMetricExporter;
  logExporter?: LogRecordExporter;
  /** Default 60s, or OTEL_METRIC_EXPORT_INTERVAL. */
  exportIntervalMillis?: number;
  env?: NodeJS.ProcessEnv;
};

/**
 * Starts the export when configured (or when exporters are passed in).
 * Never throws: a broken telemetry setup must not stop the server.
 */
export async function initOtel(options: OtelOptions = {}): Promise<boolean> {
  const env = options.env ?? process.env;
  const injected = !!(options.metricExporter || options.logExporter);
  if (instruments || (!injected && !otelConfigured(env))) return !!instruments;

  try {
    const [metricsSdk, logsSdk, resources] = await Promise.all([
      import("@opentelemetry/sdk-metrics"),
      import("@opentelemetry/sdk-logs"),
      import("@opentelemetry/resources"),
    ]);

    // OTEL_SERVICE_NAME and OTEL_RESOURCE_ATTRIBUTES override these defaults.
    const resource = resources
      .defaultResource()
      .merge(
        resources.resourceFromAttributes({
          "service.name": "openinary",
          "service.version": readVersion(),
        }),
      )
      .merge(resources.detectResources({ detectors: [resources.envDetector] }));

    const metricExporter =
      options.metricExporter ??
      new (await import("@opentelemetry/exporter-metrics-otlp-http")).OTLPMetricExporter();
    const interval =
      options.exportIntervalMillis ?? (Number(env.OTEL_METRIC_EXPORT_INTERVAL) || 60_000);
    const meterProvider = new metricsSdk.MeterProvider({
      resource,
      readers: [
        new metricsSdk.PeriodicExportingMetricReader({
          exporter: metricExporter,
          exportIntervalMillis: interval,
          exportTimeoutMillis: Math.min(30_000, interval),
        }),
      ],
    });

    const logsEnabled = env.OPENINARY_OTEL_DELIVERY_LOGS?.toLowerCase() !== "false";
    let loggerProvider: InstanceType<typeof logsSdk.LoggerProvider> | null = null;
    if (logsEnabled) {
      const logExporter =
        options.logExporter ??
        new (await import("@opentelemetry/exporter-logs-otlp-http")).OTLPLogExporter();
      loggerProvider = new logsSdk.LoggerProvider({
        resource,
        processors: [
          options.logExporter
            ? new logsSdk.SimpleLogRecordProcessor({ exporter: logExporter })
            : new logsSdk.BatchLogRecordProcessor({ exporter: logExporter }),
        ],
      });
    }

    const meter = meterProvider.getMeter("openinary");
    instruments = {
      requests: meter.createCounter("openinary.delivery.requests", {
        description: "Requests to the public delivery routes (/t and /authenticated)",
      }),
      transforms: meter.createCounter("openinary.transforms", {
        description:
          "Derivatives rendered: images and video thumbnails during a request, video transcodes when their job completes",
      }),
      duration: meter.createHistogram("openinary.delivery.duration", {
        description: "Time to answer a delivery request",
        unit: "ms",
      }),
      log: loggerProvider?.getLogger("openinary") ?? null,
      flush: async () => {
        await Promise.all([meterProvider.forceFlush(), loggerProvider?.forceFlush()]);
      },
      shutdown: async () => {
        await Promise.all([meterProvider.shutdown(), loggerProvider?.shutdown()]);
      },
    };

    logger.info(
      { deliveryLogs: logsEnabled, exportIntervalMs: interval },
      "OpenTelemetry export enabled",
    );
    return true;
  } catch (error) {
    logger.error({ error: serializeError(error) }, "OpenTelemetry export failed to start");
    return false;
  }
}

/** The request path's parts, with an /authenticated signature dropped. */
export function deliveryParts(route: DeliveryRoute, path: string) {
  let rest = path.replace(/^\/+/, "");
  if (route === "authenticated" && rest.startsWith("s--")) {
    rest = rest.slice(rest.indexOf("/") + 1 || rest.length);
  }
  const { transform, filePath } = splitTransformPath(rest);
  return {
    path: rest.slice(0, PATH_MAX),
    transform: transform.slice(0, PATH_MAX),
    filePath: filePath.slice(0, PATH_MAX),
    kind: deliveryKind(filePath),
  };
}

/** Records one delivery. A no-op until initOtel has succeeded. */
export function recordDelivery(delivery: Delivery): void {
  if (!instruments) return;
  const parts = deliveryParts(delivery.route, delivery.path);

  // Low-cardinality only: every distinct value here is a new time series.
  const attributes = {
    "openinary.route": delivery.route,
    "openinary.kind": parts.kind,
    "openinary.outcome": delivery.outcome ?? "none",
    "openinary.dashboard": delivery.dashboard,
    "http.request.method": delivery.method,
    "http.response.status_code": delivery.status,
  };
  instruments.requests.add(1, attributes);
  instruments.duration.record(delivery.durationMs, attributes);
  if (delivery.outcome === "transformed") {
    instruments.transforms.add(1, { "openinary.kind": parts.kind, "openinary.trigger": "request" });
  }

  instruments.log?.emit({
    eventName: "openinary.delivery",
    severityText: "INFO",
    body: `${delivery.method} /${delivery.route}/${parts.path} ${delivery.status}`,
    attributes: {
      ...attributes,
      "url.path": `/${delivery.route}/${parts.path}`,
      "openinary.file": parts.filePath,
      "openinary.transform": parts.transform,
      "openinary.duration_ms": delivery.durationMs,
    },
  });
}

/** Counts a video transcode the job queue finished. */
export function recordVideoTranscode(job: { filePath: string }): void {
  if (!instruments) return;
  const kind: DeliveryKind = deliveryKind(job.filePath);
  instruments.transforms.add(1, { "openinary.kind": kind, "openinary.trigger": "video_job" });
}

/** Exports whatever is buffered now. For tests and shutdown. */
export async function flushOtel(): Promise<void> {
  await instruments?.flush();
}

/** Flushes and stops, giving up after `timeoutMs` so shutdown never hangs. */
export async function shutdownOtel(timeoutMs = 3_000): Promise<void> {
  const current = instruments;
  instruments = null;
  if (!current) return;
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    current.shutdown().catch((error) => {
      logger.warn({ error: serializeError(error) }, "OpenTelemetry shutdown failed");
    }),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    }),
  ]);
  clearTimeout(timer);
}
