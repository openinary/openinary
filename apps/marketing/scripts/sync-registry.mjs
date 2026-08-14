// Copies the registry block into this app at the same targets `shadcn add`
// would use, so the homepage playground renders the exact files a user
// installs. Runs in `prebuild`; drift shows up as a dirty working tree.
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const registry = join(here, "../../../packages/registry");

const { items } = JSON.parse(
  readFileSync(join(registry, "registry.json"), "utf8"),
);

for (const { path, target } of items.flatMap((item) => item.files ?? [])) {
  // lib targets belong in the consumer's backend, not on the marketing site
  if (!target?.startsWith("components/")) continue;
  const to = join(here, "..", target);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(join(registry, path), to);
  console.log(`synced ${target}`);
}
