// The openinary skill's integration guide is aiPrompt with placeholders, kept
// as a file so the skill installs without this repo's code. This fails when
// the two drift; `tsx shared/skill-guide.test.ts --write` brings it back.

import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { skillIntegrateGuide } from "./ai-prompt.js";

const file = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../skills/openinary/references/integrate.md",
);

if (process.argv.includes("--write")) {
  writeFileSync(file, skillIntegrateGuide());
} else {
  assert.equal(
    readFileSync(file, "utf8"),
    skillIntegrateGuide(),
    "skills/openinary/references/integrate.md is stale: run tsx shared/skill-guide.test.ts --write",
  );
}
console.log("skill-guide: ok");
