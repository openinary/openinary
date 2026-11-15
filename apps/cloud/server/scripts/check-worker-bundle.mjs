// Fails if the Worker bundle pulls in what only the container can run: sharp,
// ffmpeg, the filesystem, or @openinary/core's main entrypoint (which drags
// both in). The Worker imports core only through its pure subpaths
// (@openinary/core/url, /eta); one wrong import path compiles and type-checks
// fine and only breaks at deploy, or worse, bloats the bundle past the limit.
//
// Bundles with wrangler's own resolution (`deploy --dry-run`, which uploads
// nothing; `--containers-rollout none` skips the image build, so no Docker).
// Wrangler needs Node 22+.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outdir = ".wrangler/bundle-check";
execFileSync(
  `${root}/node_modules/.bin/wrangler`,
  [
    "deploy",
    "--dry-run",
    "--containers-rollout",
    "none",
    "--outdir",
    outdir,
    "--metafile",
    `${outdir}/meta.json`,
  ],
  { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
);

const meta = JSON.parse(readFileSync(`${root}/${outdir}/meta.json`, "utf8"));
const FORBIDDEN_INPUT =
  /node_modules\/(sharp|@img|fluent-ffmpeg|ffmpeg-static|@ffmpeg-installer)\/|packages\/core\/dist\/index\.js$/;
const FORBIDDEN_IMPORT = /^(node:)?(fs|child_process)(\/|$)/;

const problems = [
  ...Object.keys(meta.inputs).filter((path) => FORBIDDEN_INPUT.test(path)),
  ...Object.entries(meta.inputs).flatMap(([path, input]) =>
    input.imports
      .filter((i) => FORBIDDEN_IMPORT.test(i.path))
      .map((i) => `${path} imports ${i.path}`),
  ),
];
if (problems.length > 0) {
  console.error("The Worker bundle pulls in container-only code:");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(
  `worker bundle: ok (${Object.keys(meta.inputs).length} inputs, no sharp/ffmpeg/fs)`,
);
