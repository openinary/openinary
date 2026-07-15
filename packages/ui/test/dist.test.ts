import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const distDir = join(dir, "..", "dist");

test("every entry emits its type declarations", () => {
  // Regression guard: tsup builds the index/server configs concurrently
  // against the same dist/ dir. A `clean: true` on either config races the
  // other's writes and can silently delete one entry's .d.ts — caught this
  // exact failure once (server.d.ts missing) before moving `clean` out of
  // tsup.config.ts into a deterministic pre-build step.
  for (const entry of ["index", "server"]) {
    assert.ok(
      existsSync(join(distDir, `${entry}.d.ts`)),
      `dist/${entry}.d.ts is missing`,
    );
  }
});

test("client entry carries the use client boundary", () => {
  const contents = readFileSync(join(distDir, "index.js"), "utf8");
  // Must be followed by a newline — Next.js/Turbopack's directive scanner
  // ignores a same-line directive even though it's valid JS syntax.
  assert.match(contents, /^"use client";\n/);
});

test("server entry does not carry the use client boundary", () => {
  const contents = readFileSync(join(distDir, "server.js"), "utf8");
  assert.doesNotMatch(contents, /use client/);
});

test("react is not bundled into the client entry", () => {
  const contents = readFileSync(join(distDir, "index.js"), "utf8");
  // Matches both `from "react"` and `from "react/jsx-runtime"` — either is
  // proof react was left external rather than inlined by esbuild.
  assert.match(contents, /from ?["']react(\/jsx-runtime)?["']/);
});
