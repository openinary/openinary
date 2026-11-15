#!/usr/bin/env node
// `pnpm install --frozen-lockfile` compares pnpm-lock.yaml against every
// workspace project, so a Docker stage that installs that way fails ("lockfile
// out of date") unless every importer's package.json was copied in before it.
// Adding a workspace package and forgetting one Dockerfile is easy; this
// catches it before an image build does.
// Run: node scripts/check-docker-manifests.mjs

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const lock = readFileSync("pnpm-lock.yaml", "utf8");
const importersBlock = lock.split(/^importers:\n/m)[1]?.split(/^\S/m)[0] ?? "";
const importers = [...importersBlock.matchAll(/^ {2}(\S[^:]*):$/gm)].map((m) => m[1]);
if (importers.length === 0) throw new Error("No importers found in pnpm-lock.yaml");

const dockerfiles = execFileSync("git", ["ls-files", "*Dockerfile", "**/*.Dockerfile"], {
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean);

const norm = (p) => p.replace(/^\.\//, "").replace(/\/+$/, "") || ".";
// A COPY of the manifest itself, of the project's folder, or of a parent folder.
const covers = (src, dir) => {
  const manifest = dir === "." ? "package.json" : `${dir}/package.json`;
  return src === "." || src === manifest || manifest.startsWith(`${src}/`);
};

let failed = false;
for (const file of dockerfiles) {
  const lines = readFileSync(file, "utf8").replace(/\\\n/g, " ").split("\n");
  let stage = 0;
  let copied = [];
  for (const line of lines) {
    const [instruction, ...args] = line.trim().split(/\s+/);
    switch (instruction?.toUpperCase()) {
      case "FROM":
        stage++;
        copied = [];
        break;
      case "COPY": {
        const operands = args.filter((a) => !a.startsWith("--"));
        if (args.some((a) => a.startsWith("--from="))) break;
        copied.push(...operands.slice(0, -1).map(norm));
        break;
      }
      case "RUN":
        if (/pnpm install\b/.test(line) && line.includes("--frozen-lockfile")) {
          const missing = importers.filter((dir) => !copied.some((src) => covers(src, dir)));
          for (const dir of missing) {
            console.error(
              `${file} (stage ${stage}): copy ${dir === "." ? "package.json" : `${dir}/package.json`} before \`pnpm install --frozen-lockfile\``,
            );
            failed = true;
          }
        }
        break;
    }
  }
}

if (failed) process.exit(1);
console.log(`Docker manifests: ok (${dockerfiles.length} Dockerfiles, ${importers.length} importers)`);
