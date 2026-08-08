import { test } from "node:test";
import assert from "node:assert/strict";
import { canDeriveFrom, deriveInstanceId } from "./telemetry-id";

const SECRET = "a".repeat(32);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test("derivation is deterministic and UUID-shaped", () => {
  const id = deriveInstanceId(SECRET);
  assert.equal(id, deriveInstanceId(SECRET));
  assert.match(id, UUID_RE);
  assert.notEqual(id, deriveInstanceId("b".repeat(32)));
});

test("placeholder, short, and missing secrets never qualify", () => {
  assert.equal(canDeriveFrom(SECRET), true);
  assert.equal(canDeriveFrom("your-secret-here-min-32-chars"), false);
  assert.equal(canDeriveFrom("short"), false);
  assert.equal(canDeriveFrom(undefined), false);
});
