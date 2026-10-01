// PrismaVideoJobStore tests. DB-backed cases run only when TEST_DATABASE_URL
// is set (local/CI: docker pg + `prisma migrate deploy` from packages/shared).
// The two-process claim test spawns REAL child processes via child_process —
// that's the exactly-once proof (not in-process concurrency).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PrismaVideoJobStore, type VideoJobDbClient } from "./prisma-video-job-store";

const dbUrl = process.env.TEST_DATABASE_URL;
const describeDb = dbUrl ? describe : describe.skip;

// `shared` is not a dependency of core (structural client typing), so tests
// import the generated PrismaClient directly via absolute file URL and pass
// `datasourceUrl` — the store under test needs no initDb/auth lifecycle
// (shared's initDb also boots better-auth, which belongs to another task).
const generatedClientUrl = new URL(
  "../../../../shared/src/generated/prisma/client.js",
  import.meta.url,
).href;

type DbClient = VideoJobDbClient & {
  $queryRawUnsafe(q: string, ...v: unknown[]): Promise<any>;
  $executeRawUnsafe(q: string, ...v: unknown[]): Promise<number>;
  $disconnect(): Promise<void>;
};

async function makeClient(): Promise<DbClient> {
  const { PrismaClient } = (await import(generatedClientUrl)) as {
    PrismaClient: new (opts: { datasourceUrl: string }) => DbClient;
  };
  return new PrismaClient({ datasourceUrl: dbUrl as string });
}

/** Truncate video_jobs between tests. */
async function cleanTable(client: DbClient) {
  await client.$executeRawUnsafe("TRUNCATE TABLE video_jobs");
}

/** Insert a row directly, bypassing store logic, with explicit columns. */
async function insertRow(
  client: DbClient,
  overrides: Record<string, unknown> = {},
) {
  const row = {
    id: randomUUID(),
    file_path: "/videos/source.mp4",
    params_json: '{"width":800}',
    cache_path: "/cache/out.mp4",
    status: "pending",
    priority: 2,
    progress: 0,
    error: null,
    retry_count: 0,
    max_retries: 3,
    created_at: BigInt(Date.now()),
    started_at: null,
    completed_at: null,
    claimed_by: null,
    heartbeat_at: null,
    ...overrides,
  };
  const cols = Object.keys(row);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  await client.$executeRawUnsafe(
    `INSERT INTO video_jobs (${cols.join(", ")}) VALUES (${placeholders})`,
    ...Object.values(row),
  );
  return row;
}

async function rawRow(client: DbClient, id: string): Promise<Record<string, unknown>> {
  const rows = await client.$queryRawUnsafe(
    "SELECT * FROM video_jobs WHERE id = $1",
    id,
  );
  return rows[0] as Record<string, unknown>;
}

describeDb("PrismaVideoJobStore — method parity", () => {
  let client: DbClient;
  let store: PrismaVideoJobStore;

  before(async () => {
    client = await makeClient();
    await cleanTable(client);
    store = new PrismaVideoJobStore(client);
  });

  after(async () => {
    await cleanTable(client).catch(() => {});
    await client.$disconnect().catch(() => {});
  });

  it("createJob inserts with defaults (priority 2, retry 0, max 3) and returns id", async () => {
    const id = await store.createJob("/v/a.mp4", { width: "100" }, "/c/a.mp4");
    const job = await store.getJobById(id);
    assert.ok(job);
    assert.equal(job.file_path, "/v/a.mp4");
    assert.equal(job.status, "pending");
    assert.equal(job.priority, 2);
    assert.equal(job.retry_count, 0);
    assert.equal(job.max_retries, 3);
    assert.equal(job.progress, 0);
    assert.ok(job.created_at > 0);
    assert.equal(job.started_at, null);
  });

  it("createJob returns existing id for same file+params while pending/processing", async () => {
    const id1 = await store.createJob("/v/dup.mp4", { width: "1" }, "/c/dup.mp4");
    const id2 = await store.createJob("/v/dup.mp4", { width: "1" }, "/c/dup.mp4");
    assert.equal(id1, id2);
    // Completed job with same key → new id
    await store.updateJobStatus(id1, "completed", 100);
    const id3 = await store.createJob("/v/dup.mp4", { width: "1" }, "/c/dup.mp4");
    assert.notEqual(id1, id3);
  });

  it("createJob normalizes params key order (dedupe regardless of key order)", async () => {
    const id1 = await store.createJob("/v/norm.mp4", { width: "5", height: "9" }, "/c/n.mp4");
    const id2 = await store.createJob("/v/norm.mp4", { height: "9", width: "5" }, "/c/n.mp4");
    assert.equal(id1, id2);
  });

  it("getNextPendingJob claims by priority ASC then created_at ASC, sets lease columns", async () => {
    await cleanTable(client);
    await insertRow(client, { id: "j-low-late", priority: 5, created_at: BigInt(1000) });
    await insertRow(client, { id: "j-high-early", priority: 1, created_at: BigInt(2000) });
    await insertRow(client, { id: "j-mid", priority: 3, created_at: BigInt(1500) });

    const job = await store.getNextPendingJob();
    assert.ok(job);
    assert.equal(job.id, "j-high-early"); // priority wins over created_at
    assert.equal(job.status, "processing");
    assert.ok(job.started_at);

    const raw = await rawRow(client, "j-high-early");
    assert.equal(raw.claimed_by, store["workerId"]);
    assert.ok(raw.heartbeat_at);

    const next = await store.getNextPendingJob();
    assert.equal(next?.id, "j-mid");

    const third = await store.getNextPendingJob();
    assert.equal(third?.id, "j-low-late");

    const none = await store.getNextPendingJob();
    assert.equal(none, null);
  });

  it("updateJobStatus sets completed_at on terminal statuses and progress/error when given", async () => {
    await insertRow(client, { id: "j-status" });
    await store.updateJobStatus("j-status", "processing", 40);
    let raw = await rawRow(client, "j-status");
    assert.equal(raw.status, "processing");
    assert.equal(raw.progress, 40);
    assert.ok(raw.heartbeat_at);
    assert.ok(raw.claimed_by);

    await store.updateJobStatus("j-status", "error", 50, "boom");
    raw = await rawRow(client, "j-status");
    assert.equal(raw.status, "error");
    assert.equal(raw.progress, 50);
    assert.equal(raw.error, "boom");
    assert.ok(raw.completed_at);
    assert.equal(raw.claimed_by, null);
  });

  it("heartbeat: updateJobStatus(processing) refreshes heartbeat_at", async () => {
    await insertRow(client, { id: "j-hb", heartbeat_at: BigInt(1) });
    const before = await rawRow(client, "j-hb");
    await new Promise((r) => setTimeout(r, 5));
    await store.updateJobStatus("j-hb", "processing", 10);
    const after = await rawRow(client, "j-hb");
    assert.ok(Number(after.heartbeat_at) > Number(before.heartbeat_at));
    assert.equal(after.claimed_by, store["workerId"]);
  });

  it("getJobByFileAndParams returns latest (created_at DESC)", async () => {
    await cleanTable(client);
    await insertRow(client, {
      id: "j-fp-old",
      file_path: "/v/fp.mp4",
      params_json: '{"width":"800"}',
      created_at: BigInt(100),
    });
    await insertRow(client, {
      id: "j-fp-new",
      file_path: "/v/fp.mp4",
      params_json: '{"width":"800"}',
      created_at: BigInt(200),
    });
    const job = await store.getJobByFileAndParams("/v/fp.mp4", { width: "800" });
    assert.equal(job?.id, "j-fp-new");
    assert.equal(await store.getJobByFileAndParams("/v/none.mp4", {}), null);
  });

  it("getJobStats counts by status", async () => {
    await cleanTable(client);
    await insertRow(client, { status: "pending" });
    await insertRow(client, { status: "pending", priority: 1 });
    await insertRow(client, { status: "processing" });
    await insertRow(client, { status: "completed" });
    await insertRow(client, { status: "error" });
    const stats = await store.getJobStats();
    assert.deepEqual(stats, {
      total: 5,
      pending: 2,
      processing: 1,
      completed: 1,
      error: 1,
    });
  });

  it("getRecentJobs pages by created_at DESC with limit/offset", async () => {
    await cleanTable(client);
    for (let i = 0; i < 5; i++) {
      await insertRow(client, { id: `j-page-${i}`, created_at: BigInt(1000 + i) });
    }
    const page1 = await store.getRecentJobs(2, 0);
    const page2 = await store.getRecentJobs(2, 2);
    assert.deepEqual(page1.map((j) => j.id), ["j-page-4", "j-page-3"]);
    assert.deepEqual(page2.map((j) => j.id), ["j-page-2", "j-page-1"]);
  });

  it("getJobsByStatus filters and limits, newest first", async () => {
    const jobs = await store.getJobsByStatus("pending", 3);
    assert.equal(jobs.length, 3);
    assert.ok(jobs.every((j) => j.status === "pending"));
    const sorted = [...jobs].sort((a, b) => b.created_at - a.created_at);
    assert.deepEqual(jobs.map((j) => j.id), sorted.map((j) => j.id));
  });

  it("countProcessingJobs counts globally", async () => {
    await cleanTable(client);
    await insertRow(client, { status: "processing" });
    await insertRow(client, { status: "pending" });
    assert.equal(await store.countProcessingJobs(), 1);
  });

  it("cleanupOldJobs deletes terminal jobs older than cutoff only", async () => {
    await cleanTable(client);
    const oldMs = Date.now() - 25 * 60 * 60 * 1000;
    await insertRow(client, { id: "j-old-done", status: "completed", completed_at: BigInt(oldMs) });
    await insertRow(client, { id: "j-old-err", status: "error", completed_at: BigInt(oldMs) });
    await insertRow(client, { id: "j-new-done", status: "completed", completed_at: BigInt(Date.now()) });
    await insertRow(client, { id: "j-old-pending", status: "pending", created_at: BigInt(oldMs) });

    const deleted = await store.cleanupOldJobs(24);
    assert.equal(deleted, 2);
    assert.ok((await store.getJobById("j-new-done")) !== null);
    assert.ok((await store.getJobById("j-old-pending")) !== null);
    assert.equal(await store.getJobById("j-old-done"), null);
    assert.equal(await store.getJobById("j-old-err"), null);
  });

  it("retryFailedJob: error→pending, retry_count+1, gates on max_retries, rejects non-error", async () => {
    await cleanTable(client);
    await insertRow(client, { id: "j-retry", status: "error", error: "x", retry_count: 1, max_retries: 3 });
    assert.equal(await store.retryFailedJob("j-retry"), true);
    const job = await store.getJobById("j-retry");
    assert.equal(job?.status, "pending");
    assert.equal(job?.retry_count, 2);
    assert.equal(job?.error, null);
    assert.equal(job?.started_at, null);
    assert.equal(job?.completed_at, null);

    // Non-error → false
    await insertRow(client, { id: "j-retry-pending", status: "pending" });
    assert.equal(await store.retryFailedJob("j-retry-pending"), false);
    // Missing → false
    assert.equal(await store.retryFailedJob("nope"), false);
    // Max retries reached → false
    await insertRow(client, { id: "j-retry-max", status: "error", retry_count: 3, max_retries: 3 });
    assert.equal(await store.retryFailedJob("j-retry-max"), false);
  });

  it("cancelJob: pending→cancelled with completed_at; non-pending/missing → false", async () => {
    await cleanTable(client);
    await insertRow(client, { id: "j-cancel" });
    assert.equal(await store.cancelJob("j-cancel"), true);
    const job = await store.getJobById("j-cancel");
    assert.equal(job?.status, "cancelled");
    assert.ok(job?.completed_at);

    await insertRow(client, { id: "j-cancel-processing", status: "processing" });
    assert.equal(await store.cancelJob("j-cancel-processing"), false);
    assert.equal(await store.cancelJob("nope"), false);
  });

  it("deleteJob returns true/false by existence", async () => {
    await insertRow(client, { id: "j-del" });
    assert.equal(await store.deleteJob("j-del"), true);
    assert.equal(await store.deleteJob("j-del"), false);
  });

  it("deleteJobsByFilePath deletes all matching rows, returns count", async () => {
    await cleanTable(client);
    await insertRow(client, { file_path: "/v/bulk.mp4" });
    await insertRow(client, { file_path: "/v/bulk.mp4", status: "completed" });
    await insertRow(client, { file_path: "/v/other.mp4" });
    const n = await store.deleteJobsByFilePath("/v/bulk.mp4");
    assert.equal(n, 2);
    assert.equal(await store.countProcessingJobs(), 0);
  });
});

describeDb("PrismaVideoJobStore — lease safety", () => {
  let client: DbClient;
  let store: PrismaVideoJobStore;

  before(async () => {
    client = await makeClient();
    store = new PrismaVideoJobStore(client);
  });

  after(async () => {
    await cleanTable(client).catch(() => {});
    await client.$disconnect().catch(() => {});
  });

  it("resetOrphanedProcessingJobs reclaims stale rows only — fresh processing row untouched", async () => {
    await cleanTable(client);
    const staleMs = Date.now() - 400_000; // > LEASE_TTL (300s)
    await insertRow(client, {
      id: "j-stale-hb",
      status: "processing",
      heartbeat_at: BigInt(staleMs),
      claimed_by: "dead-worker",
      started_at: BigInt(staleMs),
    });
    await insertRow(client, {
      id: "j-null-hb",
      status: "processing",
      heartbeat_at: null,
    });
    await insertRow(client, {
      id: "j-fresh",
      status: "processing",
      heartbeat_at: BigInt(Date.now()),
      claimed_by: "live-worker",
      started_at: BigInt(Date.now()),
    });
    await insertRow(client, { id: "j-pending-bystander", status: "pending" });

    const reset = await store.resetOrphanedProcessingJobs();
    assert.equal(reset, 2);

    const stale = await rawRow(client, "j-stale-hb");
    assert.equal(stale.status, "pending");
    assert.equal(stale.claimed_by, null);
    assert.equal(stale.started_at, null);
    assert.equal(stale.heartbeat_at, null);

    const nullHb = await rawRow(client, "j-null-hb");
    assert.equal(nullHb.status, "pending");

    const fresh = await rawRow(client, "j-fresh");
    assert.equal(fresh.status, "processing"); // NEVER touched
    assert.equal(fresh.claimed_by, "live-worker");

    const bystander = await rawRow(client, "j-pending-bystander");
    assert.equal(bystander.status, "pending");
  });

  it("heartbeat keeps a live claimed row fresh through another instance's resetOrphanedProcessingJobs", async () => {
    await cleanTable(client);
    await insertRow(client, { id: "j-lease-live" });
    // Instance A claims via the real claim path (sets claimed_by + heartbeat).
    const storeA = new PrismaVideoJobStore(client, "worker-a");
    const claimed = await storeA.getNextPendingJob();
    assert.ok(claimed, "claim should find the pending row");
    // Fresh heartbeat like the worker's interval would produce.
    await storeA.updateJobStatus(claimed.id, "processing", 42);

    const storeB = new PrismaVideoJobStore(client, "worker-b");
    const reset = await storeB.resetOrphanedProcessingJobs();
    assert.equal(reset, 0, "fresh leased row must not be reclaimed");

    const row = await rawRow(client, claimed.id);
    assert.equal(row.status, "processing");
    assert.equal(row.claimed_by, "worker-a");
    assert.equal(row.progress, 42);
  });

  it("fencing: foreign worker's processing update no-ops; owner's refreshes", async () => {
    await cleanTable(client);
    await insertRow(client, { id: "j-fence" });
    const storeA = new PrismaVideoJobStore(client, "worker-a");
    const claimed = await storeA.getNextPendingJob();
    assert.ok(claimed);
    const before = await rawRow(client, claimed.id);
    assert.equal(before.claimed_by, "worker-a");
    assert.ok(before.heartbeat_at);

    // Worker B (lost the race / stale heartbeat) must not touch A's row.
    const storeB = new PrismaVideoJobStore(client, "worker-b");
    await storeB.updateJobStatus(claimed.id, "processing", 99);
    const fenced = await rawRow(client, claimed.id);
    assert.equal(fenced.claimed_by, "worker-a", "claim stays with A");
    assert.equal(fenced.status, "processing");
    assert.equal(fenced.progress, before.progress, "no fields overwritten");
    assert.equal(
      String(fenced.heartbeat_at),
      String(before.heartbeat_at),
      "heartbeat unchanged",
    );

    // A's own heartbeat DOES apply.
    await new Promise((r) => setTimeout(r, 5));
    await storeA.updateJobStatus(claimed.id, "processing", 50);
    const refreshed = await rawRow(client, claimed.id);
    assert.equal(refreshed.progress, 50);
    assert.ok(
      Number(refreshed.heartbeat_at) > Number(before.heartbeat_at),
      "owner's heartbeat refreshes",
    );
  });
});

describeDb("PrismaVideoJobStore — two-process exactly-once claim", () => {
  it("two real child processes drain N jobs with no duplicate claims", async () => {
    const client = await makeClient();
    await cleanTable(client);

    const N = 20;
    for (let i = 0; i < N; i++) {
      await insertRow(client, {
        id: `j-2p-${i}`,
        file_path: `/v/two-proc-${i}.mp4`,
        params_json: `{"i":${i}}`,
      });
    }

    const storeUrl = new URL("./prisma-video-job-store.ts", import.meta.url).href;
    // Child script: claims jobs until none left; writes claimed ids to the
    // file in CHILD_OUT (stdout carries pino logs). Runs from a temp .mts
    // file because `node -e` cannot combine with --input-type=module under
    // `--import tsx`.
    const tmpDir = await mkdtemp(join(tmpdir(), "openinary-2p-"));
    const childScript = (outPath: string) => `
      const { PrismaClient } = await import(${JSON.stringify(generatedClientUrl)});
      const { writeFileSync } = await import("node:fs");
      const { PrismaVideoJobStore } = await import(${JSON.stringify(storeUrl)});
      const db = new PrismaClient({ datasourceUrl: ${JSON.stringify(dbUrl)} });
      const store = new PrismaVideoJobStore(db, "child-" + process.pid);
      const claimed = [];
      while (true) {
        const job = await store.getNextPendingJob();
        if (!job) break;
        claimed.push(job.id);
      }
      writeFileSync(${JSON.stringify(outPath)}, JSON.stringify(claimed));
      await db.$disconnect();
    `;

    const out1Path = join(tmpDir, "claims-1.json");
    const out2Path = join(tmpDir, "claims-2.json");
    await writeFile(join(tmpDir, "claim-jobs-1.mts"), childScript(out1Path));
    await writeFile(join(tmpDir, "claim-jobs-2.mts"), childScript(out2Path));

    const runChild = (scriptPath: string) =>
      new Promise<void>((resolve, reject) => {
        const child = spawn(process.execPath, ["--import", "tsx", scriptPath], {
          cwd: process.cwd(),
          env: { ...process.env },
          stdio: ["ignore", "ignore", "pipe"],
        });
        let err = "";
        child.stderr.on("data", (d) => (err += d));
        child.on("error", reject);
        child.on("close", (code) => {
          if (code !== 0) reject(new Error(`child exit ${code}: ${err}`));
          else resolve();
        });
        // Hard kill safety: never leak a child process.
        const timer = setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {}
        }, 60_000);
        timer.unref?.();
      });

    await Promise.all([
      runChild(join(tmpDir, "claim-jobs-1.mts")),
      runChild(join(tmpDir, "claim-jobs-2.mts")),
    ]);
    const ids1: string[] = JSON.parse(await readFile(out1Path, "utf8"));
    const ids2: string[] = JSON.parse(await readFile(out2Path, "utf8"));
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});

    const all = [...ids1, ...ids2];
    assert.equal(all.length, N, "every job claimed");
    assert.equal(new Set(all).size, N, "no job claimed twice");

    // DB end-state: nothing pending left behind by claimers
    const remaining = await client.$queryRawUnsafe(
      "SELECT COUNT(*)::int AS c FROM video_jobs WHERE status = 'pending'",
    );
    assert.equal(remaining[0].c, 0);

    await cleanTable(client);
    await client.$disconnect().catch(() => {});
  });
});
