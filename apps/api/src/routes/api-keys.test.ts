import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

// Regression: the routes queried apiKey.userId after the column became
// referenceId, so list, delete and update all answered 500.
test("an API key can list, rename and delete keys", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openinary-api-keys-"));
  process.env.DB_PATH = path.join(dir, "auth.db");
  process.env.BETTER_AUTH_SECRET = "x".repeat(32);

  const { getAuth } = await import("shared/auth");
  const { default: apiKeys } = await import("./api-keys");

  const auth = getAuth();
  const { user } = await auth.api.signUpEmail({
    body: { email: "admin@example.com", password: "Passw0rd!", name: "Admin" },
  });
  const { key } = await auth.api.createApiKey({ body: { userId: user.id } });
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  const created = await (
    await apiKeys.request("/create", { method: "POST", headers, body: JSON.stringify({ name: "second" }) })
  ).json();
  const id = created.apiKey.id;

  const list = await apiKeys.request("/list", { headers });
  assert.equal(list.status, 200);
  assert.equal((await list.json()).keys.length, 2);

  const patched = await apiKeys.request(`/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ name: "renamed" }),
  });
  assert.equal(patched.status, 200);

  const deleted = await apiKeys.request(`/${id}`, { method: "DELETE", headers });
  assert.equal(deleted.status, 200);
  assert.equal((await (await apiKeys.request("/list", { headers })).json()).keys.length, 1);

  fs.rmSync(dir, { recursive: true, force: true });
});
