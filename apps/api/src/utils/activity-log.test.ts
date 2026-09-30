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
