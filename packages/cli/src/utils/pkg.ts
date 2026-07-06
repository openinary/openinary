import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";

/**
 * Walks up from `startDir` until it finds a directory containing package.json.
 * Works whether this code is running from the bundled dist/*.js (flat, one
 * level below the package root) or from raw src/**\/*.ts during tests.
 */
function findPackageRoot(startDir: string): string {
  let dir = startDir;
  while (true) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error("Could not locate the create-openinary package root.");
    }
    dir = parent;
  }
}

export function getPackageRoot(importMetaUrl: string): string {
  return findPackageRoot(path.dirname(fileURLToPath(importMetaUrl)));
}

export function getCliVersion(importMetaUrl: string): string {
  const root = getPackageRoot(importMetaUrl);
  const pkg = fs.readJsonSync(path.join(root, "package.json")) as { version: string };
  return pkg.version;
}
