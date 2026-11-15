// Generates the two copies of the file-uploader block from its source,
// packages/registry/src/file-uploader (what `shadcn add` installs):
//
// - packages/ui/src/file-uploader, with the registry's `@/` aliases rewritten
//   to @openinary/ui's relative paths;
// - apps/marketing/components/openinary, verbatim, at the targets
//   registry.json gives, so the homepage playground runs the installed files.
//
// Edit the registry copy, then run `node scripts/sync-registry-block.mjs`
// (both copies), or pass `ui` / `marketing` for one. The marketing prebuild
// writes only its own copy: rewriting packages/ui mid-build would race the
// @openinary/ui build in a full turbo run. CI
// (.github/workflows/registry.yml) fails when either copy drifts.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const registryDir = join(rootDir, "packages/registry");
const uiDir = join(rootDir, "packages/ui/src/file-uploader");
const marketingDir = join(rootDir, "apps/marketing");

const only = process.argv[2];
if (only && only !== "ui" && only !== "marketing") {
  console.error(`sync-registry-block: unknown copy "${only}" (ui | marketing)`);
  process.exit(1);
}

const UI_REWRITES = [
  ['from "@/components/openinary/use-file-upload"', 'from "./use-file-upload"'],
  ['from "@/lib/utils"', 'from "../lib/utils"'],
  ['from "@/components/ui/button"', 'from "../ui/button"'],
  ['from "@/components/ui/progress"', 'from "../ui/progress"'],
];

const { items } = JSON.parse(
  readFileSync(join(registryDir, "registry.json"), "utf8"),
);
const files = items
  .find((item) => item.name === "file-uploader")
  .files.filter((file) => file.target?.startsWith("components/"));

for (const { path, target } of files) {
  const source = readFileSync(join(registryDir, path), "utf8");

  if (only !== "ui") {
    const marketingPath = join(marketingDir, target);
    mkdirSync(dirname(marketingPath), { recursive: true });
    writeFileSync(marketingPath, source);
  }
  if (only === "marketing") continue;

  let ui = source;
  for (const [from, to] of UI_REWRITES) ui = ui.split(from).join(to);
  // A new `@/` import needs a rewrite above, or @openinary/ui won't build.
  const leftover = ui.match(/from ["']@\/[^"']*["']/g);
  if (leftover) {
    console.error(
      `sync-registry-block: ${path} has unmapped alias import(s): ${leftover.join(", ")}\n` +
        "Add a rewrite for it in scripts/sync-registry-block.mjs.",
    );
    process.exit(1);
  }
  writeFileSync(join(uiDir, target.split("/").pop()), ui);
}

console.log(
  `sync-registry-block: wrote (${only ?? "ui, marketing"})`,
  files.map((file) => file.target).join(", "),
);
