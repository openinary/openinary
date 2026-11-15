import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { requireSecret } from "./auth";

const initEnvScript = fileURLToPath(new URL("../../../scripts/init-env.js", import.meta.url));

test("a recreated container keeps the secret persisted on the data volume", () => {
  // The script resolves paths from its own location: give it a fake checkout.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "init-env-"));
  fs.mkdirSync(path.join(root, "scripts"));
  fs.mkdirSync(path.join(root, "apps/api"), { recursive: true });
  fs.copyFileSync(initEnvScript, path.join(root, "scripts/init-env.js"));
  fs.writeFileSync(path.join(root, "package.json"), '{"type":"module"}');
  fs.writeFileSync(path.join(root, "apps/api/env.template"), "BETTER_AUTH_URL=http://localhost:3000\n");
  const env: NodeJS.ProcessEnv = { ...process.env, DB_PATH: path.join(root, "data/auth.db") };
  delete env.BETTER_AUTH_SECRET;
  delete env.BETTER_AUTH_URL;
  const run = () =>
    execFileSync(process.execPath, [path.join(root, "scripts/init-env.js"), "--shell"], {
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });

  const first = run();
  assert.match(first, /^export BETTER_AUTH_SECRET='[0-9a-f]{64}'$/m);
  assert.match(first, /^export BETTER_AUTH_URL='http:\/\/localhost:3000'$/m);
  assert.equal((fs.statSync(path.join(root, "data/.secret")).mode & 0o777).toString(8), "600");

  fs.rmSync(path.join(root, "apps/api/.env"));
  assert.equal(run(), first);
});

test("only the build-time placeholder refuses to start, and only in production", () => {
  const saved = { ...process.env };
  try {
    // Object.assign: Next's types (web type-checks this file) make NODE_ENV readonly.
    Object.assign(process.env, { BETTER_AUTH_SECRET: "build-time-secret-will-be-replaced", NODE_ENV: "production" });
    assert.throws(requireSecret, /placeholder/);
    Object.assign(process.env, { NODE_ENV: "development" });
    assert.equal(requireSecret(), "build-time-secret-will-be-replaced");
    Object.assign(process.env, { BETTER_AUTH_SECRET: "your-secret-here-min-32-chars", NODE_ENV: "production" });
    assert.equal(requireSecret(), "your-secret-here-min-32-chars");
  } finally {
    process.env = saved;
  }
});
