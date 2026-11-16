// /status maths: day bars, uptime weighting, active vs past, probe override.
// Run: pnpm --filter marketing test
import assert from "node:assert/strict";

import { computeStatus } from "../lib/status.ts";

const now = Date.parse("2026-11-16T12:00:00Z");
const past = {
  id: "outage",
  title: "API down",
  impact: "major",
  components: ["api"],
  updates: [
    { at: "2026-11-10T01:00:00Z", status: "resolved", body: "Fixed." },
    { at: "2026-11-10T00:00:00Z", status: "investigating", body: "Looking." },
  ],
};
const ongoing = {
  id: "slow",
  title: "Slow transcodes",
  impact: "partial",
  components: ["processing"],
  updates: [{ at: "2026-11-16T11:00:00Z", status: "investigating", body: "Looking." }],
};

const s = computeStatus(now, [past, ongoing], {});
const api = s.components.find((c) => c.id === "api");
const processing = s.components.find((c) => c.id === "processing");

assert.equal(api.days.length, 90);
assert.equal(api.days.at(-1).date, "2026-11-16");
assert.equal(api.days.find((d) => d.date === "2026-11-10").impact, "major");
assert.equal(api.days.find((d) => d.date === "2026-11-11").impact, "operational");
assert.equal(api.impact, "operational", "a resolved incident leaves the component operational");

const windowMs = now - Date.parse("2026-08-19T00:00:00Z");
assert.ok(Math.abs(api.uptime - (1 - 3_600_000 / windowMs)) < 1e-9, "one hour of major outage");
assert.ok(Math.abs(processing.uptime - (1 - (0.3 * 3_600_000) / windowMs)) < 1e-9, "partial counts 30%");

assert.equal(processing.impact, "partial");
assert.equal(s.impact, "partial");
assert.deepEqual(s.active.map((i) => i.id), ["slow"]);
assert.deepEqual(s.past.map((i) => i.id), ["outage"]);

assert.equal(computeStatus(now, [], { dashboard: "major" }).impact, "major", "a failed probe wins");
assert.equal(computeStatus(now, [], {}).impact, "operational");

console.log("status-check ok");
