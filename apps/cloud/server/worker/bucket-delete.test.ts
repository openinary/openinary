// Run with: pnpm -F server test
//
// DELETE /buckets/:bucketId sweeps a whole bucket by calling deleteFolder with
// an empty folder path, which is the one place r2-storage.ts's prefix maths is
// load-bearing in a destructive direction: too narrow and the bucket is dropped
// from Postgres while its objects stay orphaned in R2 forever, too wide and it
// takes another tenant's files with it. That boundary is what this pins.

import assert from "node:assert/strict";
import { deleteFolder } from "./r2-storage.js";

const TENANT_ROOT = "ugc/user_123/bucket_abc";

const KEYS = [
  // this bucket
  `public/${TENANT_ROOT}/`,
  `public/${TENANT_ROOT}/photo.jpg`,
  `public/${TENANT_ROOT}/nested/deep/clip.mp4`,
  // same account, different bucket - a prefix that shares the userId
  "public/ugc/user_123/bucket_xyz/photo.jpg",
  // another account whose id starts with this one's
  "public/ugc/user_1234/bucket_abc/photo.jpg",
  // the shared, un-prefixed transform cache
  "cache/9f8e7d6c.webp",
];

const deleted: string[] = [];

// Minimal stand-in for the R2 binding: only list (single page) and delete.
const bucket = {
  list: async ({ prefix }: { prefix: string }) => ({
    objects: KEYS.filter((key) => key.startsWith(prefix)).map((key) => ({
      key,
      size: 10,
    })),
    truncated: false,
    cursor: undefined,
  }),
  delete: async (keys: string | string[]) => {
    deleted.push(...(Array.isArray(keys) ? keys : [keys]));
  },
} as unknown as R2Bucket;

const { count, bytes } = await deleteFolder(bucket, TENANT_ROOT, "");

assert.deepEqual(
  deleted.sort(),
  [
    `public/${TENANT_ROOT}/`,
    `public/${TENANT_ROOT}/nested/deep/clip.mp4`,
    `public/${TENANT_ROOT}/photo.jpg`,
  ],
  "deleteFolder with an empty path must cover exactly this bucket's own prefix",
);
assert.equal(count, 3);
assert.equal(bytes, 30, "bytes feed the storage_mb credit-back on delete");

console.log("bucket-delete: ok");
