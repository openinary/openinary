// UsageMeter.trackStorage: the running byte total lives in the Durable Object
// and only the change in its rounded megabytes reaches Autumn. If the counter
// stopped surviving an eviction, every upload after one would be billed from
// zero again; if the delta stopped being taken off the total, per-file
// rounding would drift from what the account actually stores.

import assert from "node:assert/strict";
import { register } from "node:module";

// usage-meter.ts extends cloudflare:workers' DurableObject, which only the
// Workers runtime provides. The stub keeps what the base class does: hold
// ctx and env.
const stub =
  "export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }";
register(
  "data:text/javascript," +
    encodeURIComponent(
      `export async function resolve(s, c, next) { return s === "cloudflare:workers" ? { url: "data:text/javascript," + ${JSON.stringify(encodeURIComponent(stub))}, shortCircuit: true } : next(s, c); }`,
    ),
);
process.env.DATABASE_URL ??= "postgresql://u:p@localhost/db";
const { autumn } = await import("../shared/autumn.js");
const { UsageMeter } = await import("./usage-meter.js");

const MB = 1024 * 1024;
const tracked: { featureId: string; value: number }[] = [];
let autumnDown = false;
autumn.customers.getOrCreate = (async () => ({})) as never;
autumn.track = (async ({ featureId, value }: { featureId: string; value: number }) => {
  if (autumnDown) throw new Error("Autumn unreachable");
  tracked.push({ featureId, value });
  return {};
}) as never;

const storage = new Map<string, unknown>();
async function meter() {
  let ready: Promise<unknown> = Promise.resolve();
  const ctx = {
    id: { name: "user_1" },
    storage: {
      get: async (key: string) => storage.get(key),
      put: async (key: string, value: unknown) => void storage.set(key, value),
      getAlarm: async () => null,
    },
    blockConcurrencyWhile: (fn: () => Promise<unknown>) => (ready = fn()),
  };
  const instance = new UsageMeter(ctx as never, {} as never);
  await ready;
  return instance;
}

const mb = () => tracked.map((t) => t.value);

let m = await meter();
await m.trackStorage(0.4 * MB);
await m.trackStorage(0.4 * MB);
assert.deepEqual(mb(), [1], "two 0.4 MB uploads round to 1 MB between them");
assert.ok(tracked.every((t) => t.featureId === "storage_mb"));
assert.equal(storage.get("storageBytes"), 0.8 * MB);

// A fresh instance (after an eviction) continues from the stored total.
m = await meter();
await m.trackStorage(-0.4 * MB);
assert.deepEqual(mb(), [1, -1], "the counter did not survive an eviction");

// Autumn failing does not throw and is not retried (track is not idempotent);
// the stored total still moves, so the next change is rounded against what
// the account really stores.
autumnDown = true;
const logError = console.error;
console.error = () => {};
await m.trackStorage(2 * MB);
console.error = logError;
autumnDown = false;
assert.equal(storage.get("storageBytes"), 2.4 * MB);
await m.trackStorage(-2.4 * MB);
assert.deepEqual(mb(), [1, -1, -2]);

console.log("usage-meter-storage: ok");
