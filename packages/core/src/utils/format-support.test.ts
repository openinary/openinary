import { test } from "node:test";
import assert from "node:assert/strict";

import { isTransformSegment, parseParams } from "./parser";
import { IMAGE_FORMATS, VIDEO_FORMATS, determineOutputFormat } from "./video/format";

// The f_ parameter is the trust boundary: every value it lets through must be a
// format some encoder can actually produce, otherwise we serve bytes of one
// format under the content-type of another.

test("f_ accepts only encodable output formats", () => {
  for (const f of ["webp", "jpg", "jpeg", "png", "avif", "gif", "mp4", "webm", "mov", "auto"]) {
    assert.ok(isTransformSegment(`f_${f}`), `${f} should be accepted`);
  }
});

test("f_ rejects formats no encoder produces", () => {
  // psd is an accepted upload format but never an output; the rest were never
  // wired to any encoder and silently fell back to png/mp4.
  for (const f of ["psd", "avi", "mp3", "wav", "ogg", "pdf", "tiff"]) {
    assert.ok(!isTransformSegment(`f_${f}`), `${f} should be rejected`);
  }
});

test("every f_ value maps to a real image or video output format", () => {
  const encodable = new Set([...IMAGE_FORMATS, ...VIDEO_FORMATS, "auto"]);
  for (const f of ["webp", "jpg", "jpeg", "png", "avif", "gif", "mp4", "webm", "mov", "auto"]) {
    const { format } = parseParams(`/t/f_${f}/x.jpg`);
    assert.ok(encodable.has(format), `${f} parsed to unencodable ${format}`);
  }
});

test("video thumbnails resolve to an image format, video transforms to a video one", () => {
  assert.deepEqual(determineOutputFormat("mp4", "webp"), {
    format: "webp",
    isImageOutput: true,
    isThumbnail: true,
  });
  assert.equal(determineOutputFormat("mp4", "webm").format, "webm");
  // psd is no longer an image output, so it can't produce a bogus image/psd
  assert.equal(determineOutputFormat("mp4", "psd").isImageOutput, false);
});
