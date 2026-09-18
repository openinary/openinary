import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { createStorageRoute } from "./storage";
import { invalidateListingCache } from "../utils/storage/listing-cache";

// Listings return keys relative to the media prefix, so the prefix has to be
// stripped by its own length. Stripping a fixed number of characters happens to
// work while the prefix is always "public/" and silently corrupts every key the
// moment it is not: an empty prefix eats the firstseven characters of a real
// key, and a shorter or longer one is off by the difference.

const routeWith = (mediaPrefix: string, keys: string[]) => {
  const storage: any = {
    mediaPrefix,
    mediaKey: (p: string) => `${mediaPrefix}${p}`,
    listAllParallel: async () => keys.map((key) => ({ key, size: 1 })),
  };
  return new Hono().route(
    "/storage",
    createStorageRoute({ storage, queue: {} as any } as any),
  );
};

const folders = async (mediaPrefix: string, keys: string[]) => {
  // The full listing is memoized process-wide, so each case has to start clean
  // or it asserts against the previous one's objects.
  invalidateListingCache();
  const response = await routeWith(mediaPrefix, keys).request(
    "/storage/folders",
  );
  assert.equal(response.status, 200);
  return ((await response.json()) as { folders: string[] }).folders;
};

test("keys are stripped by the prefix length, not a fixed offset", async () => {
  // "public/" is 7 characters, so this is the case a hardcoded offset gets right
  assert.deepEqual(
    await folders("public/", ["public/photos/2024/a.jpg"]),
    ["photos", "photos/2024"],
  );

  // ...and these are the ones it silently corrupts.
  assert.deepEqual(
    await folders("", ["photos/2024/a.jpg"]),
    ["photos", "photos/2024"],
    "an empty prefix must leave keys untouched",
  );
  assert.deepEqual(
    await folders("media/", ["media/photos/2024/a.jpg"]),
    ["photos", "photos/2024"],
    "a shorter prefix must not strip an extra character",
  );
  assert.deepEqual(
    await folders("very/long/prefix/", ["very/long/prefix/photos/2024/a.jpg"]),
    ["photos", "photos/2024"],
    "a longer prefix must be stripped in full",
  );
});

test("objects outside the media prefix are ignored", async () => {
  assert.deepEqual(
    await folders("media/", [
      "media/photos/a.jpg",
      ".openinary/stats.json", // bucket-root bookkeeping, not media
      "public/photos/b.jpg", // a different prefix entirely
    ]),
    ["photos"],
  );
});
