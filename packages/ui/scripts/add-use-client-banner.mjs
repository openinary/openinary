// tsup's `banner` option is silently dropped by esbuild when bundling ESM
// output ("Module level directives cause errors when bundled... was
// ignored") — it never reaches dist/index.js. Stamp it ourselves instead.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const target = join(dir, "..", "dist", "index.js");

const contents = readFileSync(target, "utf8");
if (!contents.startsWith('"use client";\n')) {
  // Next.js/Turbopack's directive scanner requires "use client" to be
  // followed by a newline to recognize the client boundary — a same-line
  // directive (no newline) parses fine as JS but is silently ignored,
  // and every re-export from this module then breaks with "only works in
  // a Client Component" errors. The newline shifts every subsequent
  // line's sourcemap by one; accepted, correctness comes first.
  writeFileSync(target, `"use client";\n${contents}`);
}
