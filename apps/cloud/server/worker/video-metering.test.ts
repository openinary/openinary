// Run with: npx tsx worker/video-metering.test.ts
//
// billableJob turns two timestamps into a charge, so every branch here is
// either money taken or money forgone. Pins the rounding direction and, more
// importantly, that every unusable input yields null rather than a guess.

import assert from "node:assert/strict";
import { billableJob } from "../api/lib/video-metering.js";

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

console.log("video-metering: ok");
