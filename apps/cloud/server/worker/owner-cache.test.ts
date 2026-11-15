// The owner cache's write rules. They exist because one KV value has two owners writing to it on different
// schedules - UsageMeter's alarm every 60s, the admin panel on a click - and a
// blind write from either side silently undoes the other. That failure is
// invisible: service quietly resumes for a suspended account, or a blocked
// account is quietly unblocked, with nothing logged either way.

import assert from "node:assert/strict";

import {
  mergeOwnerState,
  parseBucketOwner,
  withSuspended,
  writeBlocked,
} from "./owner-cache.js";

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

// --- a deleted bucket stays deleted ---

// UsageMeter's flush writes the block state of every bucket the account ever
// served through. A bucket deleted while that flush is waiting on KV must not
// be written back: the CDN would resolve an owner for a bucket that no longer
// exists.
{
  const kv = new Map<string, string>([
    ["keep", store({ userId: USER, blocked: false })],
    ["gone", store({ userId: USER, blocked: false })],
  ]);
  let buckets = ["keep", "gone"];
  await writeBlocked(
    {
      get: async (key) => {
        // The bucket delete lands mid-flush: meter forgets it, KV entry goes.
        if (key === "gone") {
          buckets = buckets.filter((id) => id !== "gone");
          kv.delete("gone");
        }
        return kv.get(key) ?? null;
      },
      put: async (key, value) => void kv.set(key, value),
      delete: async (key) => void kv.delete(key),
    },
    () => buckets,
    USER,
    true,
  );
  assert.equal(kv.has("gone"), false, "flush resurrected a deleted bucket");
  assert.equal(parseBucketOwner(kv.get("keep") ?? null)?.blocked, true);
}

console.log("owner-cache: ok");
