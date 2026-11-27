import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, test } from "node:test";
import { migrate } from "shared";
import { createAuth } from "shared/auth";
import { openSqliteTestDatabase, testDialects } from "shared/testing";

import {
  ActivityLog,
  LOG_LIMIT,
  deliveryKind,
  isDashboardTraffic,
  isOpeningRange,
} from "./activity-log";

for (const dialect of testDialects()) {
  describe(dialect.name, { skip: dialect.skip }, () => {
    const freshLog = async () => new ActivityLog(await dialect.open());

    test("a repeat from the same viewer inside the window is one line", async () => {
      const log = await freshLog();
      await log.recordDelivery({ p: "w_500/a.jpg", s: 200, t: 1_000 }, "1.1.1.1");
      await log.recordDelivery({ p: "w_500/a.jpg", s: 200, t: 2_000 }, "1.1.1.1");
      await log.recordDelivery({ p: "w_500/a.jpg", s: 200, t: 2_000 }, "2.2.2.2");
      await log.recordDelivery({ p: "w_500/a.jpg", s: 200, t: 20_000 }, "1.1.1.1");
      assert.equal((await log.deliveries()).length, 3);
    });

    test("the log keeps the newest LOG_LIMIT rows, newest first", async () => {
      const log = await freshLog();
      for (let i = 0; i < LOG_LIMIT + 20; i++) {
        await log.recordDelivery({ p: `${i}.jpg`, s: 200, t: i }, "v");
      }
      const rows = await log.deliveries();
      assert.equal(rows.length, LOG_LIMIT);
      assert.equal(rows[0].p, `${LOG_LIMIT + 19}.jpg`);
      assert.equal(rows.at(-1)?.p, "20.jpg");
    });

    test("concurrent deliveries all land", async () => {
      const log = await freshLog();
      await Promise.all(
        Array.from({ length: 30 }, (_, i) =>
          log.recordDelivery({ p: `c-${i}.jpg`, s: 200, t: 3_600_000 + i }, "v"),
        ),
      );
      assert.equal((await log.deliveries()).length, 30);
      assert.deepEqual(await log.counts(0), [{ t: 3_600_000, k: "image", d: 30, f: 0 }]);
    });

    // Delivery writes are a transaction; so is every Better Auth sign-up. On
    // SQLite both share one connection, and two Kysely instances over it
    // interleaved their BEGINs ("cannot start a transaction within a
    // transaction": failed sign-ups, lost deliveries). A deadlock would show
    // as the timeout.
    test("deliveries and sign-ups at the same time all land", { timeout: 30_000 }, async () => {
      const db = await dialect.open();
      const log = new ActivityLog(db);
      const ctx = await createAuth(db, randomBytes(32).toString("hex")).$context;
      const results = await Promise.allSettled([
        ...Array.from({ length: 100 }, (_, i) =>
          log.recordDelivery({ p: `mix-${i}.png`, s: 200, t: 3_600_000 + i }, `v${i}`),
        ),
        ...Array.from({ length: 5 }, (_, i) =>
          ctx.internalAdapter.createOAuthUser(
            { email: `sso${i}@example.com`, name: `sso${i}`, emailVerified: true },
            { providerId: "oidc", accountId: `sso-${i}` },
          ),
        ),
      ]);
      const failures = results.flatMap((r) => (r.status === "rejected" ? [String(r.reason)] : []));
      assert.deepEqual(failures, []);
      assert.equal((await log.deliveries()).length, 100);
      const users = await db.selectFrom("user").select("role").execute();
      assert.equal(users.length, 5);
      assert.equal(users.filter((u) => u.role === "admin").length, 1);
    });

    test("a failed delivery is logged but does not tick the checklist", async () => {
      const log = await freshLog();
      await log.recordDelivery({ p: "missing.jpg", s: 404 }, "v");
      assert.equal(await log.hasDelivered(), false);
      await log.recordDelivery({ p: "a.mp4", s: 206 }, "v");
      assert.equal(await log.hasDelivered(), true);
      assert.equal((await log.deliveries())[0].k, "video");
    });

    test("the API upload flag sticks", async () => {
      const log = await freshLog();
      assert.equal(await log.apiUploadSeen(), false);
      await log.markApiUpload();
      await log.markApiUpload();
      assert.equal(await log.apiUploadSeen(), true);
    });

    test("counts tally every delivery by hour and kind, past the log's limit", async () => {
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
  });
}

// SQLite only: the legacy upgrade step that backfills the counts.
test("counts start from the lines an upgrading instance already has", async () => {
  const db = await openSqliteTestDatabase();
  await new ActivityLog(db).recordDelivery({ p: "a.png", s: 200, t: 7_200_000 }, "v");
  await db.deleteFrom("delivery_counts").execute();
  await migrate(db);
  assert.deepEqual(await new ActivityLog(db).counts(0), [
    { t: 7_200_000, k: "image", d: 1, f: 0 },
  ]);
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
  // The Cloud's split: only what the pipeline transforms counts as image/video.
  assert.equal(deliveryKind("w_500/logo.svg"), "other");
  assert.equal(deliveryKind("clips/a.MOV"), "video");
});
