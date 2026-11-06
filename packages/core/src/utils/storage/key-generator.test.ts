import { test } from "node:test";
import assert from "node:assert/strict";
import { KeyGenerator } from "./key-generator";

test("cloud cache keys do not depend on param key order", () => {
  // The request parses params in URL order; the video job store hands the
  // worker the same params with sorted keys. Both must land on one key.
  const asRequested = { width: 320, overlayPath: "wm.png", overlayGravity: "southeast" };
  const asStored = { overlayGravity: "southeast", overlayPath: "wm.png", width: 320 };
  assert.equal(
    KeyGenerator.generateKey("blue.mp4", asRequested),
    KeyGenerator.generateKey("blue.mp4", asStored),
  );
});

test("different params still give different keys", () => {
  assert.notEqual(
    KeyGenerator.generateKey("blue.mp4", { width: 320 }),
    KeyGenerator.generateKey("blue.mp4", { width: 321 }),
  );
});
