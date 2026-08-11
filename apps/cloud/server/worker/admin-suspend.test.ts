// Run with: npx tsx worker/admin-suspend.test.ts
//
// The two pure rules the admin panel's suspension depends on.
//
// Both exist because one KV value has two owners writing to it on different
// schedules - UsageMeter's alarm every 60s, the admin panel on a click - and a
// blind write from either side silently undoes the other. That failure is
// invisible: service quietly resumes for a suspended account, or a blocked
// account is quietly unblocked, with nothing logged either way.

import assert from "node:assert/strict";
import {
  mergeOwnerState,
  parseBucketOwner,
  withSuspended,
} from "../api/lib/bucket-owner.js";
import { parseAssetRef } from "./asset-ref.js";

const USER = "user_1";
const store = (owner: unknown) => JSON.stringify(owner);

// --- the meter's side: never clobber an admin suspension ---

// The regression this whole mechanism exists for. An account suspended by an
// admin is, by definition, usually still inside its quota - so the very next
// flush computes blocked:false and would have written the suspension away.
const afterFlush = mergeOwnerState(
  store({ userId: USER, blocked: false, suspended: true }),
  { userId: USER, blocked: false },
);
assert.equal(afterFlush.suspended, true, "flush erased an admin suspension");
assert.equal(afterFlush.blocked, false);

// The meter still owns `blocked` outright: going over quota while suspended
// must set it, and both flags coexist.
assert.deepEqual(
  mergeOwnerState(store({ userId: USER, blocked: false, suspended: true }), {
    userId: USER,
    blocked: true,
  }),
  { userId: USER, blocked: true, suspended: true },
);

// A bucket that has never served traffic has no stored value at all.
assert.deepEqual(mergeOwnerState(null, { userId: USER, blocked: true }), {
  userId: USER,
  blocked: true,
  suspended: false,
});

// Values written before block tracking existed were a bare userId string. They
// must not throw, and must not read as suspended.
assert.deepEqual(parseBucketOwner(USER), { userId: USER, blocked: false });
assert.deepEqual(mergeOwnerState(USER, { userId: USER, blocked: false }), {
  userId: USER,
  blocked: false,
  suspended: false,
});

// --- the admin's side: never clobber a quota block ---

// Un-suspending an account that is also out of quota must not hand it a free
// window of service until the next flush notices.
assert.deepEqual(
  withSuspended(store({ userId: USER, blocked: true, suspended: true }), {
    userId: USER,
    suspended: false,
  }),
  { userId: USER, blocked: true, suspended: false },
);

// And suspending must not pretend an over-quota account is back under it.
assert.deepEqual(
  withSuspended(store({ userId: USER, blocked: true, suspended: false }), {
    userId: USER,
    suspended: true,
  }),
  { userId: USER, blocked: true, suspended: true },
);

// A bucket with no KV entry yet is not blocked - suspending it is the first
// thing ever written for it.
assert.deepEqual(withSuspended(null, { userId: USER, suspended: true }), {
  userId: USER,
  blocked: false,
  suspended: true,
});

// The round trip an actual suspend/unsuspend cycle performs, with a flush in
// the middle: the account ends up exactly where it started.
const cut = store(
  withSuspended(store({ userId: USER, blocked: false, suspended: false }), {
    userId: USER,
    suspended: true,
  }),
);
const flushed = store(mergeOwnerState(cut, { userId: USER, blocked: false }));
assert.deepEqual(withSuspended(flushed, { userId: USER, suspended: false }), {
  userId: USER,
  blocked: false,
  suspended: false,
});

// --- takedown references ---

// What a complaint actually quotes: the URL a viewer saw, transform segment and
// all. The file that has to go is the original behind it, not that derivative -
// deleting only the derivative leaves the next request to regenerate it.
assert.deepEqual(
  parseAssetRef("https://cdn.openinary.dev/b/buck_1/t/w_500,q_80/photo.png"),
  { bucketId: "buck_1", filePath: "photo.png" },
);

// Same URL without a transform - "t" is always there, the params are not.
assert.deepEqual(
  parseAssetRef("https://cdn.openinary.dev/b/buck_1/t/photo.png"),
  { bucketId: "buck_1", filePath: "photo.png" },
);

// Nested paths survive intact, and a query string is not part of the key.
assert.deepEqual(parseAssetRef("/b/buck_1/t/press/2026/hero.png?v=3"), {
  bucketId: "buck_1",
  filePath: "press/2026/hero.png",
});

// R2 keys are not percent-encoded; every write path decodes (see
// extractFilePath), so a takedown that didn't would miss the file it names.
assert.deepEqual(parseAssetRef("/b/buck_1/t/La%20Mar%C3%A9e.png"), {
  bucketId: "buck_1",
  filePath: "La Marée.png",
});

// A bare "{bucketId}/path", which is what gets pasted out of our own logs.
assert.deepEqual(parseAssetRef("buck_1/press/hero.png"), {
  bucketId: "buck_1",
  filePath: "press/hero.png",
});

// Nothing left to point at. Must refuse rather than resolve to the bucket root,
// which deleteOneAsset would happily treat as a path.
assert.equal(parseAssetRef("https://cdn.openinary.dev/b/buck_1/t/"), null);
assert.equal(parseAssetRef("/b/buck_1"), null);
assert.equal(parseAssetRef("   "), null);

console.log("admin-suspend: ok");
