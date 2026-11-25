import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { Hono } from "hono";
import { createTransformRoute, enginePathsIn, type RouteDeps } from "@openinary/core";
import { InMemoryLogRecordExporter } from "@opentelemetry/sdk-logs";
import { AggregationTemporality, InMemoryMetricExporter } from "@opentelemetry/sdk-metrics";

import { measureDelivery } from "../middleware/metrics";
import {
  deliveryParts,
  flushOtel,
  initOtel,
  otelConfigured,
  recordDelivery,
  recordVideoTranscode,
  shutdownOtel,
} from "./otel";

// A 2x2 PNG, so the test needs no image library of its own.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVR4nGMwNj5jbHyGAUIBAB8iBMnEzdVsAAAAAElFTkSuQmCC",
  "base64",
);

const metrics = new InMemoryMetricExporter(AggregationTemporality.DELTA);
const logs = new InMemoryLogRecordExporter();

before(async () => {
  // Nothing configured, nothing injected: stays off.
  assert.equal(await initOtel({ env: {} }), false);
  assert.equal(
    await initOtel({ metricExporter: metrics, logExporter: logs, exportIntervalMillis: 60_000, env: {} }),
    true,
  );
});
after(() => shutdownOtel());

/** Sum of a counter's data points since the last call, per attribute set. */
async function collect(name: string) {
  metrics.reset();
  logs.reset();
  return {
    points: async () => {
      await flushOtel();
      return metrics
        .getMetrics()
        .flatMap((rm) => rm.scopeMetrics)
        .flatMap((sm) => sm.metrics)
        .filter((m) => m.descriptor.name === name)
        .flatMap((m) => m.dataPoints as { attributes: Record<string, unknown>; value: unknown }[]);
    },
    logs: () => logs.getFinishedLogRecords(),
  };
}

test("only the standard OTEL_* variables turn it on", () => {
  assert.equal(otelConfigured({}), false);
  assert.equal(otelConfigured({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://c:4318" }), true);
  assert.equal(otelConfigured({ OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: "http://c:4318/v1/logs" }), true);
  assert.equal(
    otelConfigured({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://c:4318", OTEL_SDK_DISABLED: "true" }),
    false,
  );
});

test("a path splits into file and transformation, minus any signature", () => {
  assert.deepEqual(deliveryParts("t", "w_100,h_50/photos/a.jpg"), {
    path: "w_100,h_50/photos/a.jpg",
    transform: "w_100,h_50",
    filePath: "photos/a.jpg",
    kind: "image",
  });
  assert.deepEqual(deliveryParts("authenticated", "s--abc123--/w_100/clip.mp4"), {
    path: "w_100/clip.mp4",
    transform: "w_100",
    filePath: "clip.mp4",
    kind: "video",
  });
  assert.equal(deliveryParts("t", "docs/a.pdf").transform, "");
});

test("a delivery is one request, one transform when rendered, and one log record", async () => {
  const c = await collect("openinary.delivery.requests");
  recordDelivery({
    route: "t",
    path: "w_100/a.jpg",
    method: "GET",
    status: 200,
    outcome: "transformed",
    durationMs: 12.5,
    dashboard: false,
  });
  recordDelivery({
    route: "t",
    path: "w_100/a.jpg",
    method: "GET",
    status: 200,
    outcome: "cache",
    durationMs: 1,
    dashboard: false,
  });

  const requests = await c.points();
  assert.equal(requests.length, 2, "transformed and cache are separate series");
  assert.deepEqual(
    requests.map((p) => [p.attributes["openinary.outcome"], p.value]).sort(),
    [
      ["cache", 1],
      ["transformed", 1],
    ],
  );
  assert.equal(requests[0].attributes["url.path"], undefined, "no URL on a metric");

  const records = c.logs();
  assert.equal(records.length, 2);
  assert.equal(records[0].eventName, "openinary.delivery");
  assert.equal(records[0].attributes["url.path"], "/t/w_100/a.jpg");
  assert.equal(records[0].attributes["openinary.transform"], "w_100");
  assert.equal(records[0].attributes["openinary.file"], "a.jpg");
  assert.equal(records[0].attributes["openinary.duration_ms"], 12.5);
  assert.equal(records[0].resource.attributes["service.name"], "openinary");
});

test("transforms count rendered images and finished video jobs, not cache hits", async () => {
  const c = await collect("openinary.transforms");
  for (const outcome of ["transformed", "cache", "original", "queued"] as const) {
    recordDelivery({ route: "t", path: "w_1/a.png", method: "GET", status: 200, outcome, durationMs: 1, dashboard: false });
  }
  recordVideoTranscode({ filePath: "clip.mp4" });

  const points = await c.points();
  assert.deepEqual(
    points.map((p) => [p.attributes["openinary.trigger"], p.attributes["openinary.kind"], p.value]).sort(),
    [
      ["request", "image", 1],
      ["video_job", "video", 1],
    ],
  );
});

test("the middleware records what the transform route actually did", async () => {
  const dir = await mkdtemp(join(tmpdir(), "otel-"));
  try {
    await mkdir(join(dir, "public"));
    await writeFile(join(dir, "public", "a.png"), PNG);
    const queue = { getJobByPath: () => undefined } as unknown as RouteDeps["queue"];
    const app = new Hono();
    app.use("/t/*", measureDelivery("t"));
    app.route("/t", createTransformRoute({ storage: null, queue, paths: enginePathsIn(dir) }));

    const c = await collect("openinary.delivery.requests");
    assert.equal((await app.request("/t/w_1/a.png")).status, 200);
    assert.equal((await app.request("/t/missing.png")).status, 404);

    const records = c.logs();
    assert.deepEqual(
      records.map((r) => [r.attributes["url.path"], r.attributes["http.response.status_code"], r.attributes["openinary.outcome"]]),
      [
        ["/t/w_1/a.png", 200, "transformed"],
        ["/t/missing.png", 404, "none"],
      ],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
