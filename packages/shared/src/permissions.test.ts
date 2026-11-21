import assert from "node:assert/strict";
import { test } from "node:test";

import { type Action, can, isRole, mediaActionFor, ROLES } from "./permissions";

const ACTIONS: Action[] = [
  "media:read",
  "media:write",
  "queue:manage",
  "apiKeys:manage",
  "settings:manage",
  "users:manage",
];

const allowed = (role: unknown) => ACTIONS.filter((a) => can(role, a));

test("each role gets exactly its row of the matrix", () => {
  assert.deepEqual(allowed("viewer"), ["media:read"]);
  assert.deepEqual(allowed("member"), ["media:read", "media:write", "queue:manage", "apiKeys:manage"]);
  assert.deepEqual(allowed("admin"), ACTIONS);
});

test("anything that isn't a known role gets nothing", () => {
  for (const role of [null, undefined, "", "Admin", "owner", "user", 1, {}]) {
    assert.deepEqual(allowed(role), [], String(role));
    assert.equal(isRole(role), false);
  }
  assert.deepEqual(ROLES.filter(isRole), ["admin", "member", "viewer"]);
});

test("reads need media:read, everything else media:write", () => {
  for (const m of ["GET", "get", "HEAD", "OPTIONS"]) assert.equal(mediaActionFor(m), "media:read");
  for (const m of ["POST", "PUT", "PATCH", "DELETE", "delete"]) assert.equal(mediaActionFor(m), "media:write");
});
