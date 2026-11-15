import { test } from "node:test";
import assert from "node:assert/strict";
import { formatFileSize } from "../src/details-sidebar/utils";

// One formatter for the storage tab, the upload list and the asset details,
// which used to disagree (the old details one topped out at MB).
test("formatFileSize scales through every unit", () => {
  assert.equal(formatFileSize(null), "Unknown");
  assert.equal(formatFileSize(0), "0 B");
  assert.equal(formatFileSize(512), "512 B");
  assert.equal(formatFileSize(1536), "1.50 KB");
  assert.equal(formatFileSize(5 * 1024 ** 2), "5.00 MB");
  assert.equal(formatFileSize(3 * 1024 ** 3), "3.00 GB");
  assert.equal(formatFileSize(2 * 1024 ** 5), "2048.00 TB");
});
