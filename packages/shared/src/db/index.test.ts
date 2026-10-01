// DB core tests. DB-backed cases run only when TEST_DATABASE_URL is set
// (CI/local: docker pg + `prisma migrate deploy`). The missing-DATABASE_URL
// case always runs.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

// Fresh module instance per test group: node:test runs each file in its own
// process, but initDb/getDb hold module state — import once and reset env
// between cases deliberately.
import { getDb, initDb } from "./index";

const originalUrl = process.env.DATABASE_URL;
const originalSecret = process.env.BETTER_AUTH_SECRET;

after(() => {
  process.env.DATABASE_URL = originalUrl;
  process.env.BETTER_AUTH_SECRET = originalSecret;
});

describe("initDb — missing DATABASE_URL", () => {
  it("rejects with an error mentioning DATABASE_URL", async () => {
    delete process.env.DATABASE_URL;
    await assert.rejects(
      () => import("./index").then((m) => m.initDb()),
      (err: Error) => err.message.includes("DATABASE_URL")
    );
  });

  it("getDb() throws a pre-init error before initDb succeeds", async () => {
    delete process.env.DATABASE_URL;
    assert.throws(() => getDb(), /not initialized|DATABASE_URL/);
  });
});

const dbUrl = process.env.TEST_DATABASE_URL;
const describeDb = dbUrl ? describe : describe.skip;

describeDb("initDb — migrated postgres (TEST_DATABASE_URL)", () => {
  before(() => {
    process.env.BETTER_AUTH_SECRET =
      process.env.BETTER_AUTH_SECRET || "test-secret-0123456789abcdef0123456789abcdef";
  });

  it("resolves, getDb() usable, VideoJob round-trips", async () => {
    process.env.DATABASE_URL = dbUrl;
    await initDb();
    // Idempotent second call.
    await initDb();

    const db = getDb();
    const created = await db.videoJob.create({
      data: {
        id: `test-job-${Date.now()}`,
        filePath: "/tmp/in.mp4",
        paramsJson: "{}",
        cachePath: "/tmp/out.mp4",
        status: "pending",
        createdAt: BigInt(Date.now()),
      },
    });
    assert.equal(created.filePath, "/tmp/in.mp4");
    assert.equal(created.status, "pending");

    const read = await db.videoJob.findUnique({ where: { id: created.id } });
    assert.ok(read);
    assert.equal(read.paramsJson, "{}");
    assert.equal(read.priority, 2); // default
    assert.equal(read.retryCount, 0); // default

    await db.videoJob.delete({ where: { id: created.id } });
    assert.equal(await db.videoJob.count(), 0);
  });
});
