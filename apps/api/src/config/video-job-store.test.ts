import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, test } from "node:test";
import type { Database } from "shared";
import { openTestDatabases, testDialects } from "shared/testing";

import { DbVideoJobStore, POSTGRES_ORPHAN_AFTER_MS } from "./video-job-store";

const HOUR = 3_600_000;

/** A job row written directly, for states createJob doesn't produce. */
async function insertJob(
  db: Database,
  fields: Partial<{
    id: string;
    file_path: string;
    status: "pending" | "processing" | "completed" | "error" | "cancelled";
    priority: number;
    created_at: number;
    started_at: number | null;
    completed_at: number | null;
    retry_count: number;
  }> = {},
) {
  const id = fields.id ?? randomUUID();
  await db
    .insertInto("video_jobs")
    .values({
      id,
      file_path: fields.file_path ?? `${id}.mp4`,
      params_json: "{}",
      cache_path: `/cache/${id}`,
      status: fields.status ?? "pending",
      priority: fields.priority ?? 2,
      created_at: fields.created_at ?? Date.now(),
      started_at: fields.started_at ?? null,
      completed_at: fields.completed_at ?? null,
      retry_count: fields.retry_count ?? 0,
    })
    .execute();
  return id;
}

for (const dialect of testDialects()) {
  describe(`DbVideoJobStore (${dialect.name})`, { skip: dialect.skip }, () => {
    const fresh = async () => {
      const db = await dialect.open();
      return { db, store: new DbVideoJobStore(db) };
    };

    test("createJob returns the pending or processing job for the same file and params", async () => {
      const { store } = await fresh();
      const id = await store.createJob("a.mp4", { width: 640, quality: 80 } as never, "/c/a");
      // Key order doesn't matter
      assert.equal(await store.createJob("a.mp4", { quality: 80, width: 640 } as never, "/c/a"), id);
      assert.notEqual(await store.createJob("a.mp4", { width: 320 } as never, "/c/b"), id);

      const job = await store.getJobById(id);
      assert.equal(job?.status, "pending");
      assert.equal(job?.max_retries, 3);
      assert.equal(typeof job?.created_at, "number");
      assert.equal((await store.getJobByFileAndParams("a.mp4", { quality: 80, width: 640 } as never))?.id, id);

      // Claimed: still the same job
      assert.equal((await store.getNextPendingJob())?.id, id);
      assert.equal(await store.createJob("a.mp4", { width: 640, quality: 80 } as never, "/c/a"), id);

      // Done: a new one
      await store.updateJobStatus(id, "completed", 100);
      assert.notEqual(await store.createJob("a.mp4", { width: 640, quality: 80 } as never, "/c/a"), id);
    });

    test("concurrent createJob calls from two connections queue one job", async () => {
      const [a, b] = await openTestDatabases(dialect.name, 2);
      const stores = [new DbVideoJobStore(a), new DbVideoJobStore(b)];
      const ids = await Promise.all(
        Array.from({ length: 16 }, (_, i) =>
          stores[i % 2].createJob("race.mp4", { width: 100 } as never, "/c/race"),
        ),
      );
      assert.equal(new Set(ids).size, 1);
      assert.equal((await stores[0].getJobStats()).total, 1);
    });

    test("getNextPendingJob claims by priority, then age", async () => {
      const { db, store } = await fresh();
      const now = Date.now();
      const late = await insertJob(db, { priority: 1, created_at: now });
      const early = await insertJob(db, { priority: 1, created_at: now - 1000 });
      const low = await insertJob(db, { priority: 3, created_at: now - 5000 });
      await insertJob(db, { status: "completed", priority: 0 });

      const first = await store.getNextPendingJob();
      assert.equal(first?.id, early);
      assert.equal(first?.status, "processing");
      assert.equal(typeof first?.started_at, "number");
      assert.equal((await store.getJobById(early))?.status, "processing");
      assert.equal((await store.getNextPendingJob())?.id, late);
      assert.equal((await store.getNextPendingJob())?.id, low);
      assert.equal(await store.getNextPendingJob(), null);
      assert.equal(await store.countProcessingJobs(), 3);
    });

    test("concurrent claims from two connections never return the same job", async () => {
      const [a, b] = await openTestDatabases(dialect.name, 2);
      const stores = [new DbVideoJobStore(a), new DbVideoJobStore(b)];
      const jobs = 30;
      for (let i = 0; i < jobs; i++) await insertJob(a, { created_at: 1000 + i });

      // Each connection keeps claiming until the queue is empty, both at once
      // and several claims in flight per connection.
      const claimed: string[] = [];
      const drain = async (store: DbVideoJobStore) => {
        for (;;) {
          const job = await store.getNextPendingJob();
          if (!job) return;
          claimed.push(job.id);
        }
      };
      await Promise.all([...stores, ...stores, ...stores].map(drain));

      assert.equal(claimed.length, jobs);
      assert.equal(new Set(claimed).size, jobs);
      assert.equal(await stores[0].countProcessingJobs(), jobs);
    });

    test("updateJobStatus records progress, errors and completion time", async () => {
      const { store } = await fresh();
      const id = await store.createJob("u.mp4", {} as never, "/c/u");
      await store.updateJobStatus(id, "processing", 42);
      let job = await store.getJobById(id);
      assert.equal(job?.progress, 42);
      assert.equal(job?.completed_at, null);

      await store.updateJobStatus(id, "error", 50, "boom");
      job = await store.getJobById(id);
      assert.equal(job?.status, "error");
      assert.equal(job?.error, "boom");
      assert.equal(typeof job?.completed_at, "number");
    });

    test("retry puts an errored job back to pending, up to max_retries", async () => {
      const { db, store } = await fresh();
      const id = await insertJob(db, { status: "error", completed_at: Date.now() });
      assert.equal(await store.retryFailedJob(id), true);
      const job = await store.getJobById(id);
      assert.equal(job?.status, "pending");
      assert.equal(job?.retry_count, 1);
      assert.equal(job?.error, null);
      assert.equal(job?.completed_at, null);

      // Not in error any more
      assert.equal(await store.retryFailedJob(id), false);
      // Out of retries
      const spent = await insertJob(db, { status: "error", retry_count: 3 });
      assert.equal(await store.retryFailedJob(spent), false);
      assert.equal(await store.retryFailedJob("missing"), false);
    });

    test("cancel only takes pending jobs; delete removes one or a file's", async () => {
      const { db, store } = await fresh();
      const pending = await insertJob(db);
      const running = await insertJob(db, { status: "processing", started_at: Date.now() });
      assert.equal(await store.cancelJob(pending), true);
      assert.equal((await store.getJobById(pending))?.status, "cancelled");
      assert.equal(await store.cancelJob(running), false);
      assert.equal(await store.cancelJob("missing"), false);

      assert.equal(await store.deleteJob(pending), true);
      assert.equal(await store.deleteJob(pending), false);
      assert.equal(await store.getJobById(pending), null);

      await insertJob(db, { file_path: "shared.mp4" });
      await insertJob(db, { file_path: "shared.mp4", status: "completed" });
      assert.equal(await store.deleteJobsByFilePath("shared.mp4"), 2);
      assert.equal(await store.deleteJobsByFilePath("shared.mp4"), 0);
    });

    test("stats, listings and cleanup", async () => {
      const { db, store } = await fresh();
      assert.deepEqual(await store.getJobStats(), {
        total: 0,
        pending: 0,
        processing: 0,
        completed: 0,
        error: 0,
      });

      const now = Date.now();
      await insertJob(db, { created_at: now - 3 });
      await insertJob(db, { created_at: now - 2, status: "processing", started_at: now });
      const oldDone = await insertJob(db, { created_at: now - 1, status: "completed", completed_at: now - 48 * HOUR });
      const newDone = await insertJob(db, { created_at: now, status: "completed", completed_at: now });
      await insertJob(db, { created_at: now - 10, status: "error", completed_at: now - 48 * HOUR });

      assert.deepEqual(await store.getJobStats(), {
        total: 5,
        pending: 1,
        processing: 1,
        completed: 2,
        error: 1,
      });
      const recent = await store.getRecentJobs(2, 0);
      assert.equal(recent.length, 2);
      assert.deepEqual(recent.map((j) => j.id), [newDone, oldDone]);
      assert.deepEqual((await store.getRecentJobs(1, 1)).map((j) => j.id), [oldDone]);
      assert.deepEqual(
        (await store.getJobsByStatus("completed")).map((j) => j.id).sort(),
        [oldDone, newDone].sort(),
      );

      assert.equal(await store.cleanupOldJobs(24), 2);
      assert.equal(await store.getJobById(oldDone), null);
      assert.equal((await store.getJobStats()).total, 3);
    });

    test("resetOrphanedProcessingJobs", async () => {
      const { db, store } = await fresh();
      const now = Date.now();
      const fresh1 = await insertJob(db, { status: "processing", started_at: now - 60_000 });
      const stale = await insertJob(db, {
        status: "processing",
        started_at: now - POSTGRES_ORPHAN_AFTER_MS - 60_000,
      });

      if (dialect.name === "sqlite") {
        // One instance owns the file: at boot every processing job is an orphan.
        assert.equal(await store.resetOrphanedProcessingJobs(), 2);
        assert.equal((await store.getJobById(fresh1))?.status, "pending");
      } else {
        // Shared database: a recent one may be running on another node.
        assert.equal(await store.resetOrphanedProcessingJobs(), 1);
        assert.equal((await store.getJobById(fresh1))?.status, "processing");
        // And cleanup reclaims stale ones while the node runs.
        await db.updateTable("video_jobs").set({ started_at: now - 3 * HOUR }).where("id", "=", fresh1).execute();
        await store.cleanupOldJobs(24);
        assert.equal((await store.getJobById(fresh1))?.status, "pending");
      }
      const reset = await store.getJobById(stale);
      assert.equal(reset?.status, "pending");
      assert.equal(reset?.started_at, null);
    });

    test("a store built from a database getter opens it lazily", async () => {
      const { db } = await fresh();
      let opened = 0;
      const store = new DbVideoJobStore(async () => {
        opened++;
        return db;
      });
      assert.equal(opened, 0);
      await store.countProcessingJobs();
      assert.equal(opened, 1);
    });

    // server.ts exits when the worker can't start: a database that can't be
    // opened is fatal (as a failed open at import was), a failing reset
    // query alone is logged and the worker starts anyway.
    test("the orphan reset rejects when the database can't be opened, not when its query fails", async () => {
      const unopenable = new DbVideoJobStore(() => Promise.reject(new Error("connection refused")));
      await assert.rejects(unopenable.resetOrphanedProcessingJobs(), /connection refused/);

      const { db } = await fresh();
      await db.schema.dropTable("video_jobs").execute();
      assert.equal(await new DbVideoJobStore(db).resetOrphanedProcessingJobs(), 0);
    });
  });
}
