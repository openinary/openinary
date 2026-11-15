#!/usr/bin/env node
/**
 * Copies the playground media (demo/, built by build-demo-assets.mjs) into an
 * app's public/demo/, which the manifest's "/demo/..." paths point at. Each
 * app runs it before dev and build, so the media has one home:
 *
 *   node ../../packages/dashboard/scripts/copy-demo.mjs public/demo
 *
 * demo/ is committed, so a missing one means a broken checkout: fail loudly.
 */

import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = join(dirname(fileURLToPath(import.meta.url)), "..", "demo");
const target = process.argv[2];
if (!target) {
  console.error("usage: copy-demo.mjs <app public/demo dir>");
  process.exit(1);
}
const dest = resolve(target);

if (!existsSync(SOURCE)) {
  console.error(`copy-demo: ${SOURCE} is missing (it is committed: is the checkout complete?)`);
  process.exit(1);
}
rmSync(dest, { recursive: true, force: true });
cpSync(SOURCE, dest, { recursive: true });
