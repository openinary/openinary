import assert from "node:assert/strict";
import { test } from "node:test";

import { splitDelivery } from "../src/lib/activity";

test("a leading transformation is split off the file", () => {
  assert.deepEqual(splitDelivery("w_500,f_auto/photos/a.jpg"), {
    transform: "w_500,f_auto",
    file: "photos/a.jpg",
  });
});

test("a folder that looks like key_value is part of the file", () => {
  assert.deepEqual(splitDelivery("my_photos/a.jpg"), {
    transform: "",
    file: "my_photos/a.jpg",
  });
});
