// billableJob turns two timestamps into a charge, so every branch here is
// either money taken or money forgone. Pins the rounding direction and, more
// importantly, that every unusable input yields null rather than a guess.

import assert from "node:assert/strict";
import { billableJob, meterJob } from "./video-metering.js";

const PATH = "ugc/user_123/bucket_abc/clip.mp4";

// A 90-second transcode bills 90 seconds - the whole point of the change:
// this is container time, and says nothing about the source video's length.
assert.deepEqual(
  billableJob({ filePath: PATH, startedAt: 1000, completedAt: 91_000 }),
  {
    userId: "user_123",
    seconds: 90,
  },
);

// Sub-second work still woke the container, which is what actually costs.
assert.deepEqual(
  billableJob({ filePath: PATH, startedAt: 0, completedAt: 200 }),
  {
    userId: "user_123",
    seconds: 1,
  },
);

// Rounds up, never down: 1.2s bills 2, not 1.
assert.equal(
  billableJob({ filePath: PATH, startedAt: 0, completedAt: 1200 })?.seconds,
  2,
);

// --- everything below must refuse to bill ---

// Never started (or startedAt cleared by a retry that hasn't rerun yet).
assert.equal(
  billableJob({ filePath: PATH, startedAt: null, completedAt: 5000 }),
  null,
);

// Never closed.
assert.equal(
  billableJob({ filePath: PATH, startedAt: 1000, completedAt: null }),
  null,
);

// Clock went backwards - a negative duration must not wrap into a charge.
assert.equal(
  billableJob({ filePath: PATH, startedAt: 9000, completedAt: 1000 }),
  null,
);

// Identical stamps carry no information about the work done.
assert.equal(
  billableJob({ filePath: PATH, startedAt: 1000, completedAt: 1000 }),
  null,
);

// No account recoverable from the path: bill nobody rather than guess.
assert.equal(
  billableJob({ filePath: "clip.mp4", startedAt: 0, completedAt: 5000 }),
  null,
);

// --- one job, billed once ---

// The container bills a job the moment it closes and the hourly cron sweeps
// whatever it missed. Both used to read the row as unbilled, and the cron
// charged before marking it, so a job closing while the cron ran was billed
// twice. Both now go through meterJob, whose claim lets exactly one through.
{
  const row = { meteredAt: null as number | null };
  // Stands in for the claim: an update that only lands while meteredAt is null.
  const db = {
    update: () => ({
      set: (values: { meteredAt: number }) => ({
        where: () => ({
          returning: async () => {
            await new Promise((resolve) => setTimeout(resolve, 1));
            if (row.meteredAt !== null) return [];
            row.meteredAt = values.meteredAt;
            return [{ id: "job_1" }];
          },
        }),
      }),
    }),
  } as unknown as Parameters<typeof meterJob>[0];
  const charges: number[] = [];
  const track = async (_userId: string, _feature: string, seconds: number) => {
    charges.push(seconds);
  };
  const job = { id: "job_1", filePath: PATH, startedAt: 0, completedAt: 30_000 };
  await Promise.all([meterJob(db, job, track), meterJob(db, job, track)]);
  assert.deepEqual(charges, [30], "a job was billed more than once");

  // Claimed even when there is nothing to bill, so the cron stops rescanning it.
  row.meteredAt = null;
  charges.length = 0;
  await meterJob(db, { ...job, startedAt: null }, track);
  assert.notEqual(row.meteredAt, null);
  assert.deepEqual(charges, []);
}

console.log("video-metering: ok");
