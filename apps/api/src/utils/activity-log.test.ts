import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";

import {
  ActivityLog,
  LOG_LIMIT,
  deliveryKind,
  isDashboardTraffic,
  isOpeningRange,
} from "./activity-log";

test("a repeat from the same viewer inside the window is one line", () => {
  const log = new ActivityLog(new Database(":memory:"));
  log.recordDelivery({ p: "w_500/a.jpg", s: 200, t: 1_000 }, "1.1.1.1");
  log.recordDelivery({ p: "w_500/a.jpg", s: 200, t: 2_000 }, "1.1.1.1");
  log.recordDelivery({ p: "w_500/a.jpg", s: 200, t: 2_000 }, "2.2.2.2");
  log.recordDelivery({ p: "w_500/a.jpg", s: 200, t: 20_000 }, "1.1.1.1");
  assert.equal(log.deliveries().length, 3);
});

test("the log keeps the newest LOG_LIMIT rows, newest first", () => {
  const log = new ActivityLog(new Database(":memory:"));
  for (let i = 0; i < LOG_LIMIT + 20; i++) {
    log.recordDelivery({ p: `${i}.jpg`, s: 200, t: i }, "v");
  }
  const rows = log.deliveries();
  assert.equal(rows.length, LOG_LIMIT);
  assert.equal(rows[0].p, `${LOG_LIMIT + 19}.jpg`);
  assert.equal(rows.at(-1)?.p, "20.jpg");
});

test("a failed delivery is logged but does not tick the checklist", () => {
  const log = new ActivityLog(new Database(":memory:"));
  log.recordDelivery({ p: "missing.jpg", s: 404 }, "v");
  assert.equal(log.hasDelivered(), false);
  log.recordDelivery({ p: "a.mp4", s: 206 }, "v");
  assert.equal(log.hasDelivered(), true);
  assert.equal(log.deliveries()[0].k, "video");
});

test("the API upload flag sticks", () => {
  const log = new ActivityLog(new Database(":memory:"));
  assert.equal(log.apiUploadSeen(), false);
  log.markApiUpload();
  log.markApiUpload();
  assert.equal(log.apiUploadSeen(), true);
});

test("counts tally every delivery by hour and kind, past the log's limit", () => {
  const log = new ActivityLog(new Database(":memory:"));
  const hour = 3_600_000;
  const at = 10 * hour;
  for (let i = 0; i < LOG_LIMIT + 50; i++) {
    log.recordDelivery({ p: `photo-${i}.jpg`, s: 200, t: at + i }, "v");
  }
  log.recordDelivery({ p: "missing.jpg", s: 404, t: at }, "v");
  log.recordDelivery({ p: "clip.mp4", s: 200, t: at + hour + 5 }, "v");
  // A repeat inside the dedupe window is neither a line nor a count.
  log.recordDelivery({ p: "clip.mp4", s: 200, t: at + hour + 6 }, "v");

  assert.equal(log.deliveries().length, LOG_LIMIT);
  assert.deepEqual(log.counts(at), [
    { t: at, k: "image", d: LOG_LIMIT + 50, f: 1 },
    { t: at + hour, k: "video", d: 1, f: 0 },
  ]);
  assert.deepEqual(log.counts(at + hour), [
    { t: at + hour, k: "video", d: 1, f: 0 },
  ]);
});

test("counts start from the lines an upgrading instance already has", () => {
  const db = new Database(":memory:");
  new ActivityLog(db).recordDelivery({ p: "a.png", s: 200, t: 7_200_000 }, "v");
  db.exec("DELETE FROM delivery_counts");
  assert.deepEqual(new ActivityLog(db).counts(0), [
    { t: 7_200_000, k: "image", d: 1, f: 0 },
  ]);
});

test("since is set once and survives a restart", () => {
  const db = new Database(":memory:");
  assert.equal(new ActivityLog(db).since("onboarding_since", 1000), 1000);
  assert.equal(new ActivityLog(db).since("onboarding_since", 5000), 1000);
});

test("state documents round-trip and overwrite", () => {
  const log = new ActivityLog(new Database(":memory:"));
  assert.equal(log.getState("workspace"), undefined);
  log.setState("workspace", { name: "Acme", logo: null });
  log.setState("workspace", { name: "Acme Media", logo: null });
  assert.deepEqual(log.getState("workspace"), { name: "Acme Media", logo: null });
});

test("request rules", () => {
  assert.equal(isOpeningRange(undefined), true);
  assert.equal(isOpeningRange("bytes=0-"), true);
  assert.equal(isOpeningRange("bytes=1024-2047"), false);
  assert.equal(isDashboardTraffic(undefined), false);
  assert.equal(isDashboardTraffic("theme=dark"), false);
  assert.equal(isDashboardTraffic("better-auth.session_token=abc"), true);
  assert.equal(
    isDashboardTraffic("__Secure-better-auth.session_token=abc; x=1"),
    true,
  );
  assert.equal(deliveryKind("w_500/photo.JPG"), "image");
  assert.equal(deliveryKind("notes.pdf"), "other");
});
