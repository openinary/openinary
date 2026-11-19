// Teams: who acts on which account, and what each role may do. The server
// enforces every permission through these two functions, so a wrong row here
// is a member reaching billing or an outsider reaching someone's storage.

import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgresql://u:p@localhost/db";
process.env.TEAMS_ENABLED = "true";
process.env.TEAMS_ALLOWLIST = "owner-a, owner-b";

const { can, chooseBucket, pickAccount } = await import("./account.js");
const { teamsEnabledFor } = await import("../config.js");

// --- can(): the permission matrix ---------------------------------------
const matrix = {
  owner: { media: true, "bucket.manage": true, "apiKey.manage": true, "member.manage": true, billing: true },
  admin: { media: true, "bucket.manage": true, "apiKey.manage": true, "member.manage": true, billing: false },
  member: { media: true, "bucket.manage": false, "apiKey.manage": false, "member.manage": false, billing: false },
} as const;
for (const [role, actions] of Object.entries(matrix)) {
  for (const [action, expected] of Object.entries(actions)) {
    assert.equal(
      can(role as "owner", action as "media"),
      expected,
      `${role} ${action}`,
    );
  }
}
assert.equal(can("intruder" as "owner", "media"), false, "unknown role");

// --- rollout gate --------------------------------------------------------
assert.equal(teamsEnabledFor("owner-a"), true);
assert.equal(teamsEnabledFor("owner-b"), true, "allowlist is trimmed");
assert.equal(teamsEnabledFor("someone-else"), false);
assert.equal(teamsEnabledFor(undefined), false);

// --- pickAccount(): which account a session lands on -----------------------
const on = () => true;
const membership = (over: Partial<Parameters<typeof pickAccount>[1] & object> = {}) => ({
  memberId: "m1",
  role: "member",
  ownerUserId: "owner-a",
  activeBucketId: "b2",
  ...over,
});

assert.deepEqual(pickAccount("me", undefined, on), {
  accountId: "me",
  role: "owner",
}, "no team: own account");

assert.deepEqual(pickAccount("me", membership(), on), {
  accountId: "owner-a",
  role: "member",
  memberId: "m1",
  memberBucketId: "b2",
}, "member lands on the owner's account");

assert.equal(pickAccount("me", membership({ role: "admin" }), on).role, "admin");
assert.equal(
  pickAccount("me", membership({ role: "owner" }), on).role,
  "admin",
  "a second plugin-level owner never gets billing",
);
assert.equal(
  pickAccount("me", membership({ role: "superuser" }), on).role,
  "member",
  "unknown roles get the least",
);
assert.deepEqual(
  pickAccount("owner-a", membership({ ownerUserId: "owner-a", role: "owner" }), on),
  { accountId: "owner-a", role: "owner" },
  "the owner inside their own team is the plain owner",
);
assert.deepEqual(
  pickAccount("me", membership(), () => false),
  { accountId: "me", role: "owner" },
  "team outside the rollout: back to own account",
);

// --- chooseBucket(): members keep their own pick -------------------------
assert.equal(chooseBucket(["b1", "b2"], "b2", "b1"), "b2");
assert.equal(chooseBucket(["b1", "b2"], "gone", "b1"), "b1", "deleted bucket falls back");
assert.equal(chooseBucket(["b1"], null, "b1"), "b1");

console.log("account: ok");
