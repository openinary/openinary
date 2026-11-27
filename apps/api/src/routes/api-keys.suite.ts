import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, test } from "node:test";
import type { Dialect } from "shared";
import { testDialects, useTestDatabase } from "shared/testing";

/**
 * The /api-keys routes on a throwaway instance of `dialect`. Run from
 * api-keys.test.ts (SQLite) and api-keys.postgres.test.ts: the app's database
 * is one per process, so one dialect per test file.
 */
export function apiKeysSuite(dialect: Dialect) {
  const { skip } = testDialects().find((d) => d.name === dialect)!;
  describe(`api keys (${dialect})`, { skip }, () => {
    // Regression: the routes queried apiKey.userId after the column became
    // referenceId, so list, delete and update all answered 500.
    test("an API key can list, rename and delete keys", async () => {
      await useTestDatabase(dialect);
      process.env.BETTER_AUTH_SECRET = "x".repeat(32);

      const { getAuth } = await import("shared/auth");
      const { default: apiKeys } = await import("./api-keys");

      const auth = await getAuth();
      // Generated per run: a throwaway account, never a real credential.
      const { user } = await auth.api.signUpEmail({
        body: { email: "admin@example.com", password: `T1!${randomUUID()}`, name: "Admin" },
      });
      const { key } = await auth.api.createApiKey({ body: { userId: user.id } });
      const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

      const created = await (
        await apiKeys.request("/create", { method: "POST", headers, body: JSON.stringify({ name: "second" }) })
      ).json();
      const id = created.apiKey.id;

      const list = await apiKeys.request("/list", { headers });
      assert.equal(list.status, 200);
      const { keys } = (await list.json()) as {
        keys: { id: string; enabled: unknown; rateLimitEnabled: unknown; createdAt: unknown }[];
      };
      assert.equal(keys.length, 2);
      // Same shape on both dialects, as documented.
      for (const listed of keys) {
        assert.equal(listed.enabled, true);
        assert.equal(typeof listed.rateLimitEnabled, "boolean");
        assert.match(String(listed.createdAt), /^\d{4}-\d\d-\d\dT.*Z$/);
      }

      const patched = await apiKeys.request(`/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ name: "renamed" }),
      });
      assert.equal(patched.status, 200);

      // Someone else's key: 403, a missing one: 404.
      const other = await auth.api.signUpEmail({
        body: { email: "other@example.com", password: `T1!${randomUUID()}`, name: "Other" },
      });
      const otherKey = await auth.api.createApiKey({ body: { userId: other.user.id } });
      assert.equal((await apiKeys.request(`/${otherKey.id}`, { method: "DELETE", headers })).status, 403);
      assert.equal((await apiKeys.request(`/missing`, { method: "DELETE", headers })).status, 404);

      const deleted = await apiKeys.request(`/${id}`, { method: "DELETE", headers });
      assert.equal(deleted.status, 200);
      assert.equal((await (await apiKeys.request("/list", { headers })).json()).keys.length, 1);
    });
  });
}
