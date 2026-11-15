import { test } from "node:test";
import assert from "node:assert/strict";
import { deliveryTarget, overlayPathFromValue, parseParams, splitTransformPath } from "./grammar";

test("a malformed escape in an overlay path is kept, not thrown (was a 500)", () => {
  assert.equal(overlayPathFromValue("brand:%E0.png"), "brand/%E0.png");
  assert.equal(overlayPathFromValue("brand:logo%20x.png"), "brand/logo x.png");
});

test("splitTransformPath tells a transform segment from a folder", () => {
  assert.deepEqual(splitTransformPath("w_300,h_200/photos/a.jpg"), {
    transform: "w_300,h_200",
    filePath: "photos/a.jpg",
  });
  assert.deepEqual(splitTransformPath("w_photos/a.jpg"), { transform: "", filePath: "w_photos/a.jpg" });
  assert.deepEqual(splitTransformPath("so_1.5/clip.mp4").transform, "so_1.5");
});

test("a folder named t is a folder, not the transform mount", () => {
  assert.deepEqual(parseParams("/t/t/w_100/a.jpg"), {});
  assert.deepEqual(parseParams("t/w_100/a.jpg"), {});
  assert.deepEqual(parseParams("/t/w_100/t/a.jpg"), { width: 100 });
});

test("deliveryTarget keeps d_ out of the params a video job is keyed on", () => {
  // /video-status used to keep defaultImage, so a status poll for a d_ URL
  // never found the job its /t/ request had queued.
  assert.deepEqual(deliveryTarget("w_300,d_brand:x.png/clip.mp4"), {
    transform: "w_300,d_brand:x.png",
    filePath: "clip.mp4",
    params: { width: 300 },
    defaultImage: "brand/x.png",
  });
});
