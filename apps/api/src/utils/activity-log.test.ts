// ActivityLog tests. Pure-helper cases always run; DB cases run only when
// TEST_DATABASE_URL is set (docker pg; initDb itself runs `prisma migrate
// deploy` via shared/db, which creates the activity tables).
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import {
  LOG_LIMIT,
  deliveryKind,
  isDashboardTraffic,
  isOpeningRange,
} from "./activity-log";
import { ActivityLog } from "./activity-log";

describe("request rules", () => {
  it("classifies range, dashboard, and kind", () => {
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
});

const dbUrl = process.env.TEST_DATABASE_URL;
const describeDb = dbUrl ? describe : describe.skip;

describeDb("ActivityLog — migrated postgres (TEST_DATABASE_URL)", () => {
  const originalUrl = process.env.DATABASE_URL;
  after(() => {
    process.env.DATABASE_URL = originalUrl;
  });

  let db: import("shared/db").PrismaClient;
  const freshLog = async () => {
    // One database, sequential tests: each case starts from empty tables so
    // row-cap and count assertions see only its own writes.
    await db.deliveryLog.deleteMany();
    await db.deliveryCount.deleteMany();
    await db.appState.deleteMany();
    return new ActivityLog(db);
  };

  before(async () => {
    process.env.DATABASE_URL = dbUrl;
    process.env.BETTER_AUTH_SECRET =
      process.env.BETTER_AUTH_SECRET || "test-secret-0123456789abcdef0123456789abcdef";
    const shared = await import("shared/db");
    await shared.initDb();
    db = shared.getDb();
  });

  it("a repeat from the same viewer inside the window is one line", async () => {
    const log = await freshLog();
    await log.recordDelivery({ p: "w_500/a.jpg", s: 200, t: 1_000 }, "1.1.1.1");
    await log.recordDelivery({ p: "w_500/a.jpg", s: 200, t: 2_000 }, "1.1.1.1");
    await log.recordDelivery({ p: "w_500/a.jpg", s: 200, t: 2_000 }, "2.2.2.2");
    await log.recordDelivery({ p: "w_500/a.jpg", s: 200, t: 20_000 }, "1.1.1.1");
    assert.equal((await log.deliveries()).length, 3);
  });

  it("the log keeps the newest LOG_LIMIT rows, newest first", async () => {
    const log = await freshLog();
    for (let i = 0; i < LOG_LIMIT + 20; i++) {
      await log.recordDelivery({ p: `${i}.jpg`, s: 200, t: i }, "v");
    }
    const rows = await log.deliveries();
    assert.equal(rows.length, LOG_LIMIT);
    assert.equal(rows[0].p, `${LOG_LIMIT + 19}.jpg`);
    assert.equal(rows.at(-1)?.p, "20.jpg");
  });

  it("a failed delivery is logged but does not tick the checklist", async () => {
    const log = await freshLog();
    await log.recordDelivery({ p: "missing.jpg", s: 404 }, "v");
    assert.equal(await log.hasDelivered(), false);
    await log.recordDelivery({ p: "a.mp4", s: 206 }, "v");
    assert.equal(await log.hasDelivered(), true);
    assert.equal((await log.deliveries())[0].k, "video");
  });

  it("the API upload flag sticks", async () => {
    const log = await freshLog();
    assert.equal(await log.apiUploadSeen(), false);
    await log.markApiUpload();
    await log.markApiUpload();
    assert.equal(await log.apiUploadSeen(), true);
  });

  it("counts tally every delivery by hour and kind, past the log's limit", async () => {
    const log = await freshLog();
    const hour = 3_600_000;
    const at = 10 * hour;
    for (let i = 0; i < LOG_LIMIT + 50; i++) {
      await log.recordDelivery({ p: `photo-${i}.jpg`, s: 200, t: at + i }, "v");
    }
    await log.recordDelivery({ p: "missing.jpg", s: 404, t: at }, "v");
    await log.recordDelivery({ p: "clip.mp4", s: 200, t: at + hour + 5 }, "v");
    // A repeat inside the dedupe window is neither a line nor a count.
    await log.recordDelivery({ p: "clip.mp4", s: 200, t: at + hour + 6 }, "v");

    assert.equal((await log.deliveries()).length, LOG_LIMIT);
    assert.deepEqual(await log.counts(at), [
      { t: at, k: "image", d: LOG_LIMIT + 50, f: 1 },
      { t: at + hour, k: "video", d: 1, f: 0 },
    ]);
    assert.deepEqual(await log.counts(at + hour), [
      { t: at + hour, k: "video", d: 1, f: 0 },
    ]);
  });

  it("since is set once and survives a restart", async () => {
    await freshLog();
    assert.equal(await new ActivityLog(db).since("onboarding_since", 1000), 1000);
    assert.equal(await new ActivityLog(db).since("onboarding_since", 5000), 1000);
  });

  it("state documents round-trip and overwrite", async () => {
    const log = await freshLog();
    assert.equal(await log.getState("workspace"), undefined);
    await log.setState("workspace", { name: "Acme", logo: null });
    await log.setState("workspace", { name: "Acme Media", logo: null });
    assert.deepEqual(await log.getState("workspace"), { name: "Acme Media", logo: null });
  });
});
