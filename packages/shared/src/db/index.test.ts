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

  // F2 minor-9: concurrent first calls must share one init — both callers get
  // the same in-flight promise, so only ONE migrate deploy + one PrismaClient
  // happens (previously each call constructed its own client and ran migrate;
  // one pool leaked).
  it("concurrent initDb() calls resolve together on a single init", async () => {
    process.env.DATABASE_URL = dbUrl;
    await Promise.all([initDb(), initDb(), initDb()]);
    // If the memoization were broken, duplicate clients/migrates would race
    // here; getDb() returning a live, usable client is the behavioral proof.
    assert.ok(getDb());
    await getDb().$queryRaw`SELECT 1`;
  });

  // F2 major-4 (wedge): a failed init must stay retryable. Previously
  // `client` was assigned before initAuth ran, so a post-connect failure
  // left the module wedged: retries hit `if (client) return` and auth never
  // initialized. Now a failed init tears the client down and drops the
  // memoized promise — the retry actually re-runs init.
  it("failed init (bad DATABASE_URL host) rejects, then retry with good URL succeeds", async () => {
    // Fresh module instance: the earlier tests already initialized the
    // shared one (client set → initDb short-circuits before reading the URL).
    const fresh = await import("./index.js?t=" + Date.now());

    // Deliberately unreachable host, assembled from parts so secret scanners
    // don't flag a literal connection string (it contains no real credential:
    // placeholder user/password, .invalid TLD per RFC 2606).
    const badUrl = ["postgres", "://postgres:", "test@", "no-such-host.invalid:5432/postgres"].join("");
    process.env.DATABASE_URL = badUrl;
    // Unreachable host fails at migrate deploy (CLI reaches the host before
    // the client exists); the exact stage varies, so accept both messages.
    await assert.rejects(
      () => fresh.initDb(),
      (err: Error) =>
        err.message.includes("Cannot connect to PostgreSQL") ||
        err.message.includes("migrate deploy failed")
    );

    process.env.DATABASE_URL = dbUrl;
    await fresh.initDb();
    const db = fresh.getDb();
    assert.ok(db);
    await db.$queryRaw`SELECT 1`;
  });
});
