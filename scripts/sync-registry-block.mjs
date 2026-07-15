// Generates packages/registry/src/file-uploader/* from packages/ui's copy.
//
// @openinary/ui is the source of truth for the file-uploader component; the
// shadcn registry (packages/registry) ships the same component but as
// copy-paste source using the consumer's own `@/` aliases (shadcn registries
// don't bundle — they rewrite nothing at build time, only at `shadcn add`
// time in the consumer's project). The two copies are therefore never
// byte-identical by design, so a plain `diff` can't guard against drift.
// This script re-derives the registry copy mechanically instead.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const srcDir = join(rootDir, "packages/ui/src/file-uploader");
const destDir = join(rootDir, "packages/registry/src/file-uploader");

// Ordered, most-specific-first so no rewrite is a prefix of an earlier one.
const REWRITES = [
  ['from "./use-file-upload"', 'from "@/components/openinary/use-file-upload"'],
  ['from "../lib/utils"', 'from "@/lib/utils"'],
  ['from "../ui/button"', 'from "@/components/ui/button"'],
  ['from "../ui/progress"', 'from "@/components/ui/progress"'],
];

const FILES = ["file-uploader.tsx", "use-file-upload.ts"];

for (const file of FILES) {
  const srcPath = join(srcDir, file);
  let contents = readFileSync(srcPath, "utf8");

  for (const [from, to] of REWRITES) {
    contents = contents.split(from).join(to);
  }

  // Any remaining local import means a new relative dependency appeared in
  // packages/ui's file-uploader that this script doesn't know how to remap
  // yet — fail loudly instead of silently shipping a broken registry copy.
  const leftover = contents.match(/from ["']\.\.?\/[^"']*["']/g);
  if (leftover) {
    console.error(
      `sync-registry-block: ${file} has unmapped local import(s): ${leftover.join(", ")}\n` +
        `Add a rewrite for it in scripts/sync-registry-block.mjs.`,
    );
    process.exit(1);
  }

  writeFileSync(join(destDir, file), contents);
}

console.log("sync-registry-block: wrote", FILES.join(", "));
