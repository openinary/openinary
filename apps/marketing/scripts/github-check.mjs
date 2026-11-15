// Every GitHub call sends the API's Accept header and keeps the caller's
// fetch options (contributors and release once went out without it).
// Run: pnpm --filter marketing test
import assert from "node:assert/strict";

import { getRepoStats } from "../lib/github.ts";

const calls = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url, init });
  return new Response("{}", { status: 200 });
};

await getRepoStats({ next: { revalidate: 3600 } });
assert.equal(calls.length, 5);
for (const { url, init } of calls) {
  assert.equal(init.headers.get("Accept"), "application/vnd.github+json", url);
  assert.deepEqual(init.next, { revalidate: 3600 }, url);
}
console.log("github-check: ok");
