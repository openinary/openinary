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

test("derivatives share a safe asset prefix without including raw paths", () => {
  const first = KeyGenerator.generateKey("photos/žltá.jpg", { width: 100 });
  const second = KeyGenerator.generateKey("photos/žltá.jpg", { width: 200 });
  const other = KeyGenerator.generateKey("other/žltá.jpg", { width: 100 });
  const prefix = (key: string) => key.slice(0, key.lastIndexOf("/") + 1);
  assert.match(first, /^cache\/assets\/[a-f0-9]+\/[a-f0-9]+\.jpg$/);
  assert.equal(prefix(first), prefix(second));
  assert.notEqual(prefix(first), prefix(other));
});
