import assert from "node:assert/strict";
import {
  cdnBucketId,
  cdnFilePath,
  parseAssetRef,
  parseCdnPath,
  statusPath,
  upstreamPath,
} from "./path.js";

const ROOT = "ugc/user_123/bucket_abc";

// --- the public URL ---

{
  const path = parseCdnPath("/b/bucket_abc/t/w_500,q_80/photos/La%20Mar%C3%A9e.png");
  assert.ok(path);
  assert.equal(path.bucketId, "bucket_abc");
  assert.equal(path.transform, "w_500,q_80");
  // R2 keys are stored decoded; a key built from the encoded form never matches.
  assert.equal(path.relativePath, "photos/La Marée.png");
  assert.equal(path.ext, "png");
  assert.deepEqual(path.params, { quality: "80", width: "500" });
  // The container gets the tenant root in front of the file, after the
  // transform, still encoded: core decodes it itself.
  assert.equal(
    upstreamPath(path, ROOT),
    `/t/w_500,q_80/${ROOT}/photos/La%20Mar%C3%A9e.png`,
  );
  assert.equal(statusPath(path), "/video-status/w_500,q_80/photos/La%20Mar%C3%A9e.png");
}

// No transform: "t" is the mount, never part of the file path, and a folder
// that merely looks like a transform key stays part of the path.
{
  const bare = parseCdnPath("/b/bucket_abc/t/clip.mp4");
  assert.equal(bare?.transform, "");
  assert.equal(upstreamPath(bare!, ROOT), `/t/${ROOT}/clip.mp4`);
  assert.equal(parseCdnPath("/b/bucket_abc/t/w_photos/a.jpg")?.relativePath, "w_photos/a.jpg");
}

// A malformed escape is kept as sent rather than throwing into a 500.
assert.equal(parseCdnPath("/b/bucket_abc/t/100%.png")?.relativePath, "100%.png");

// Nothing to serve: no /t/ mount, or no file after it.
assert.equal(parseCdnPath("/b/bucket_abc/photo.png"), null);
assert.equal(parseCdnPath("/b/bucket_abc/t/"), null);
assert.equal(parseCdnPath("/b/bucket_abc/t/w_500/"), null);
assert.equal(cdnBucketId("/b/bucket_abc/photo.png"), "bucket_abc");
assert.equal(cdnBucketId("/b/bucket_abc"), null);

// What an upload answers with round-trips through the parser.
{
  const url = cdnFilePath("bucket_abc", "Vidéos/a b.mp4");
  assert.equal(url, "/b/bucket_abc/t/Vid%C3%A9os/a%20b.mp4");
  assert.equal(parseCdnPath(url)?.relativePath, "Vidéos/a b.mp4");
}

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
// storageFilePath), so a takedown that didn't would miss the file it names.
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
// which deleteFile would happily treat as a path.
assert.equal(parseAssetRef("https://cdn.openinary.dev/b/buck_1/t/"), null);
assert.equal(parseAssetRef("/b/buck_1"), null);
assert.equal(parseAssetRef("   "), null);

console.log("cdn path: ok");
