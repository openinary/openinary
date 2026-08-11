// Run with: pnpm -F server test
//
// A rename/move leaves the old path's derivatives behind in cache/, where
// nothing serves them (the cache key hashes the full path) and nothing used to
// collect them either. deleteCachedTransformations is what sweeps them, and it
// has to do it for a whole renamed folder in ONE pass: cache/ keys are md5
// hashes with no per-tenant prefix, so each call scans every tenant's
// derivatives and a per-file call would blow the Worker's subrequest budget.
//
// What this pins is the matcher's edges - the folder prefix must not spill onto
// a sibling whose name it starts with, and must not widen the single-file case
// that DELETE /storage/* already relies on.

import assert from "node:assert/strict";
import { deleteCachedTransformations } from "./r2-storage.js";

const TENANT_ROOT = "ugc/user_123/bucket_abc";

// cache/ keys are opaque hashes; "x-original-path" is the only thing tying a
// derivative back to its source, hence encodeURIComponent (which escapes "/"
// as %2F - the boundary the sibling cases below turn on).
const original = (relativePath: string) => ({
  "x-original-path": encodeURIComponent(`${TENANT_ROOT}/${relativePath}`),
});

const OBJECTS = [
  { key: "cache/aaa.webp", customMetadata: original("photos/beach.jpg") },
  { key: "cache/bbb.avif", customMetadata: original("photos/beach.jpg") },
  { key: "cache/ccc.webp", customMetadata: original("photos/deep/clip.mp4") },
  // inside photos/, but its name extends beach.jpg - so the folder sweep must
  // take it and the single-file sweep must not
  { key: "cache/ddd.webp", customMetadata: original("photos/beach.jpg.bak") },
  // sibling folder sharing the target folder's name as a prefix
  { key: "cache/eee.webp", customMetadata: original("photos2/other.jpg") },
  // same relative path under a different tenant
  {
    key: "cache/fff.webp",
    customMetadata: {
      "x-original-path": encodeURIComponent(
        "ugc/user_999/bucket_xyz/photos/beach.jpg",
      ),
    },
  },
  // a derivative predating customMetadata
  { key: "cache/ggg.webp", customMetadata: undefined },
];

let listCalls = 0;
const deleted: string[] = [];

// Minimal stand-in for the R2 binding, paginated so the cursor loop is
// exercised rather than assumed.
const cache = {
  list: async ({ cursor }: { cursor?: string }) => {
    listCalls++;
    const start = cursor ? Number(cursor) : 0;
    const objects = OBJECTS.slice(start, start + 3);
    const next = start + 3;
    return {
      objects,
      truncated: next < OBJECTS.length,
      cursor: next < OBJECTS.length ? String(next) : undefined,
    };
  },
  delete: async (keys: string | string[]) => {
    deleted.push(...(Array.isArray(keys) ? keys : [keys]));
  },
} as unknown as R2Bucket;

// --- a renamed folder: every derivative beneath it, in one scan ---

const folderCount = await deleteCachedTransformations(
  cache,
  `${TENANT_ROOT}/photos`,
);

assert.deepEqual(
  deleted.sort(),
  ["cache/aaa.webp", "cache/bbb.avif", "cache/ccc.webp", "cache/ddd.webp"],
  "a renamed folder sweeps everything beneath it, and nothing from photos2/ or another tenant",
);
assert.equal(folderCount, 4);
assert.equal(
  listCalls,
  3,
  "one paginated pass total - a scan per file would exhaust the subrequest budget on a big folder",
);

// --- a renamed file: exact match only, the DELETE path's existing contract ---

deleted.length = 0;
const fileCount = await deleteCachedTransformations(
  cache,
  `${TENANT_ROOT}/photos/beach.jpg`,
);

assert.deepEqual(
  deleted.sort(),
  ["cache/aaa.webp", "cache/bbb.avif"],
  "a file takes its own derivatives only - not the .bak sibling its name prefixes",
);
assert.equal(fileCount, 2);

// --- a path with no derivatives: no delete call at all ---

deleted.length = 0;
assert.equal(
  await deleteCachedTransformations(cache, `${TENANT_ROOT}/absent.jpg`),
  0,
);
assert.deepEqual(deleted, [], "nothing matched means nothing deleted");

console.log("rename-cache-purge: ok");
