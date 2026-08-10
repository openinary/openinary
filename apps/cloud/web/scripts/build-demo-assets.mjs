#!/usr/bin/env node
/**
 * Builds every file the Get started playgrounds render, from the sources in
 * scripts/demo-sources/ into public/demo/, and emits the manifest the UI reads.
 *
 * Why precomputed and not transformed on demand: the playgrounds must never
 * wake the transform container (see the Get started plan). Uploadcare's own
 * "360p / 720p / 1080p" demo is static files too. Everything here is served
 * from the Next origin, so it costs no R2, no metering and no CDN request.
 *
 * Run by hand and commit the output - not wired into the build, which keeps
 * builds fast, deterministic, and free of an ffmpeg dependency. Paths resolve
 * off this file, so any working directory does:
 *
 *   node apps/web/scripts/build-demo-assets.mjs
 *
 * Every `segment` string below is checked against core's
 * TRANSFORM_VALUE_PATTERNS (utils/parser.js) - a segment that doesn't parse
 * would render as a URL the user can copy and that then 404s.
 */

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = join(ROOT, "scripts", "demo-sources");
const OUT = join(ROOT, "public", "demo");
const MANIFEST = join(
  ROOT,
  "src",
  "components",
  "playground",
  "demo-manifest.json",
);
const TMP = join(ROOT, "scripts", ".demo-tmp");

// Narrower widths than the source, so the "optimized" panel always has
// something real to show. The native width is added per image at runtime.
const WIDTH_STEPS = [1500, 900];
// avifenc -q: 0..100, 100 lossless (--min/--max are deprecated, and mapped to
// roughly -q 60 - which came out *heavier* than webp q78 on every source and
// made the comparison argue against AVIF). 50 against webp 78 is the usual
// visual match and lands ~30% smaller, which is the point being made.
const AVIF_QUALITY = "50";
const WEBP_QUALITY = "78";

/**
 * The three image roles. Filenames are fixed so the transform catalog below
 * can name the source it needs (a face crop wants the portrait, not the
 * product shot). Extension is discovered.
 */
const IMAGE_ROLES = [
  {
    role: "product",
    label: "Product shot",
    hint: "Detailed subject on a plain background - the honest compression case.",
  },
  {
    role: "portrait",
    label: "Portrait",
    hint: "A face off-centre, so smart cropping has something to find.",
  },
  {
    role: "landscape",
    label: "Landscape",
    hint: "Wide framing, for responsive widths and aspect-ratio crops.",
  },
];

/**
 * The static before/after catalog. `filter` is the ffmpeg approximation of what
 * the segment produces server-side; these are showcase stills, not proof of
 * output, and the segment next to each is the real thing to copy.
 */
// No plain "resize" card: the before is rendered at scale=600:-2, which is
// exactly what w_600 produces, so both halves came out byte-identical. The
// optimize comparator above is the resize demo.
const TRANSFORM_OPS = [
  {
    id: "crop-square",
    label: "Crop to fill",
    description: "Cover an exact box, cropping whatever overflows.",
    segment: "w_600,h_600,c_fill",
    source: "landscape",
    filter: "scale=600:600:force_original_aspect_ratio=increase,crop=600:600",
  },
  {
    id: "smart-crop",
    label: "Smart crop",
    description:
      "Keep the subject in frame instead of blindly cropping to the centre.",
    segment: "w_400,h_400,c_fill,g_face",
    source: "portrait",
    // ponytail: g_face is sharp's `attention` saliency strategy server-side
    // (see core utils/image/gravity.js), which ffmpeg can't reproduce. This is
    // an upper-biased square crop, which is where a portrait's subject usually
    // sits. Tune the 0.08 offset if you swap the source, or regenerate this one
    // pair from the real pipeline.
    //
    // Every expression is min(iw,ih)-based and the y offset is clamped, so the
    // crop box fits whatever the source's orientation is - a portrait taller
    // than it is wide used to ask for a box wider than the image.
    filter: `crop='min(iw,ih)':'min(iw,ih)':'(iw-min(iw,ih))/2':'min(ih*0.08,ih-min(iw,ih))',scale=400:400`,
  },
  {
    id: "aspect",
    label: "Aspect ratio",
    description: "Force a ratio - 16:9 banners from any source.",
    segment: "ar_16:9,c_fill,w_800",
    source: "landscape",
    // Largest 16:9 box that fits, whichever axis is the binding one - cropping
    // to iw:iw*9/16 asks for more height than a source wider than 16:9 has.
    filter: `crop='min(iw,ih*16/9)':'min(ih,iw*9/16)',scale=800:450`,
  },
  {
    id: "pad",
    label: "Pad",
    description: "Fit inside a box and fill the rest with a colour.",
    segment: "w_600,h_600,c_pad,b_white",
    source: "product",
    filter:
      "scale=600:600:force_original_aspect_ratio=decrease,pad=600:600:(ow-iw)/2:(oh-ih)/2:white",
  },
  {
    id: "rotate",
    label: "Rotate",
    description: "Turn by any angle, or auto from EXIF.",
    segment: "a_90",
    source: "product",
    filter: "transpose=1,scale=400:-2",
  },
  {
    id: "round",
    label: "Round corners",
    description: "Radius in pixels, or r_max for a circle.",
    segment: "w_400,h_400,c_fill,r_max",
    source: "portrait",
    // Centre square first (orientation-agnostic), then the circular alpha mask
    // at the scaled 400x400 size, hence the hardcoded 200 radius/centre.
    filter: `crop='min(iw,ih)':'min(iw,ih)':'(iw-min(iw,ih))/2':'(ih-min(iw,ih))/2',scale=400:400,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(gt((X-200)*(X-200)+(Y-200)*(Y-200),200*200),0,255)'`,
    alpha: true,
  },
];

/**
 * Video renditions. `w_N` alone keeps the source ratio, so 16:9 gives N x N*9/16.
 *
 * No 1080p: it landed at ~22MB, which is most of the repo's asset weight and
 * uncomfortably close to Cloudflare Workers' 25MiB per-file limit, for a
 * rendition that only exists to show a third number in a badge row.
 */
const VIDEO_RENDITIONS = [
  { id: "360p", label: "360p", segment: "w_640", width: 640 },
  { id: "720p", label: "720p", segment: "w_1280", width: 1280 },
];

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
}

function ensureTools() {
  const missing = ["ffmpeg", "ffprobe", "cwebp", "avifenc"].filter((tool) => {
    try {
      execFileSync("command", ["-v", tool], { shell: true, stdio: "ignore" });
      return false;
    } catch {
      return true;
    }
  });
  if (missing.length) {
    console.error(
      `Missing tools: ${missing.join(", ")}\n` +
        "  brew install ffmpeg webp libavif",
    );
    process.exit(1);
  }
}

function probeSize(file) {
  const out = execFileSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=p=0:s=x",
    file,
  ])
    .toString()
    .trim()
    .split("\n")[0];
  const [width, height] = out.split("x").map(Number);
  return { width, height };
}

function probeDuration(file) {
  const out = execFileSync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    file,
  ])
    .toString()
    .trim();
  return Math.round(Number(out) * 10) / 10;
}

/** Public path + real byte count, which is the whole point of the comparison. */
function asset(absPath) {
  return {
    src: `/demo${absPath.slice(OUT.length)}`,
    bytes: statSync(absPath).size,
  };
}

function findSource(dir, name) {
  if (!existsSync(dir)) return null;
  const match = readdirSync(dir).find(
    (file) => basename(file, extname(file)).toLowerCase() === name,
  );
  return match ? join(dir, match) : null;
}

/** ffmpeg -> PNG -> cwebp/avifenc: better encoders than ffmpeg's own. */
function encodeStill(source, filter, outBase, { alpha = false } = {}) {
  mkdirSync(dirname(outBase), { recursive: true });
  const png = join(TMP, `${basename(outBase)}-${Date.now()}.png`);
  run("ffmpeg", ["-y", "-i", source, "-vf", filter, "-frames:v", "1", png]);

  const webp = `${outBase}.webp`;
  run("cwebp", [
    "-quiet",
    ...(alpha ? [] : ["-noalpha"]),
    "-q",
    WEBP_QUALITY,
    png,
    "-o",
    webp,
  ]);

  const avif = `${outBase}.avif`;
  run("avifenc", ["-q", AVIF_QUALITY, "-s", "6", png, avif]);

  rmSync(png, { force: true });
  return { webp: asset(webp), avif: asset(avif) };
}

function buildImages() {
  const dir = join(SOURCES, "images");
  const images = [];

  for (const { role, label, hint } of IMAGE_ROLES) {
    const source = findSource(dir, role);
    if (!source) {
      console.warn(`  skip ${role}: no scripts/demo-sources/images/${role}.*`);
      continue;
    }
    const { width, height } = probeSize(source);
    const outDir = join(OUT, "images", role);
    mkdirSync(outDir, { recursive: true });

    // The original is copied through untouched: it is the "before" side of the
    // comparison, so re-encoding it would make the saving a lie.
    const originalExt = extname(source).toLowerCase();
    const originalOut = join(outDir, `original${originalExt}`);
    run("ffmpeg", ["-y", "-i", source, "-c", "copy", originalOut]);

    const widths = [width, ...WIDTH_STEPS.filter((w) => w < width)];
    const variants = widths.map((w) => {
      const encoded = encodeStill(
        source,
        `scale=${w}:-2`,
        join(outDir, `w${w}`),
      );
      return {
        width: w,
        height: Math.round((height / width) * w),
        ...encoded,
      };
    });

    images.push({
      role,
      label,
      hint,
      original: {
        ...asset(originalOut),
        width,
        height,
        format: originalExt.replace(".", "").toUpperCase(),
      },
      variants,
    });
    console.log(`  ${role}: ${variants.length} widths`);
  }
  return images;
}

function buildTransforms(images) {
  const bySource = new Map(images.map((image) => [image.role, image]));
  const transforms = [];

  for (const op of TRANSFORM_OPS) {
    const image = bySource.get(op.source);
    if (!image) {
      console.warn(`  skip ${op.id}: needs the ${op.source} source`);
      continue;
    }
    const source = findSource(join(SOURCES, "images"), op.source);
    const outDir = join(OUT, "transforms", op.id);
    mkdirSync(outDir, { recursive: true });

    // One op failing (a filter that doesn't fit an unusual source's aspect,
    // say) drops that card and nothing else - it must not throw away the
    // images already encoded above.
    try {
      // Both sides are rendered at the same box so the cards line up; the
      // "before" is just the source scaled down, untransformed.
      const before = encodeStill(
        source,
        "scale=600:-2",
        join(outDir, "before"),
      );
      const after = encodeStill(source, op.filter, join(outDir, "after"), {
        alpha: op.alpha,
      });

      transforms.push({
        id: op.id,
        label: op.label,
        description: op.description,
        segment: op.segment,
        before,
        after,
      });
      console.log(`  ${op.id}`);
    } catch (error) {
      rmSync(outDir, { recursive: true, force: true });
      console.warn(`  skip ${op.id}: ${error.message.split("\n")[0]}`);
    }
  }
  return transforms;
}

function buildVideos() {
  const dir = join(SOURCES, "videos");
  if (!existsSync(dir)) return [];
  const videos = [];

  for (const file of readdirSync(dir).filter((f) =>
    /\.(mp4|mov|m4v|webm)$/i.test(f),
  )) {
    const source = join(dir, file);
    const slug = basename(file, extname(file)).toLowerCase();
    const { width, height } = probeSize(source);
    const outDir = join(OUT, "videos", slug);
    mkdirSync(outDir, { recursive: true });

    const renditions = VIDEO_RENDITIONS.filter((r) => r.width <= width).map(
      (rendition) => {
        const out = join(outDir, `${rendition.id}.mp4`);
        run("ffmpeg", [
          "-y",
          "-i",
          source,
          "-vf",
          `scale=${rendition.width}:-2`,
          "-c:v",
          "libx264",
          "-preset",
          "slow",
          "-crf",
          "23",
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          // Without faststart the moov atom lands at the end and the player
          // has to download the whole file before it can show a frame.
          "-movflags",
          "+faststart",
          out,
        ]);
        return { ...rendition, ...asset(out) };
      },
    );

    const poster = encodeStill(
      source,
      "scale=1280:-2",
      join(outDir, "poster"),
    ).webp;

    videos.push({
      slug,
      label: slug.charAt(0).toUpperCase() + slug.slice(1),
      poster: poster.src,
      // Metadata only - the source video is deliberately not shipped (it is
      // tens of MB and nothing renders it). asset() must not be used here:
      // it derives a public path by slicing OUT off, and the source lives
      // outside OUT, which produced a mangled "/demoo-sources/..." src.
      original: {
        bytes: statSync(source).size,
        width,
        height,
        duration: probeDuration(source),
      },
      renditions,
    });
    console.log(`  ${slug}: ${renditions.length} renditions`);
  }
  return videos;
}

ensureTools();
mkdirSync(TMP, { recursive: true });
rmSync(OUT, { recursive: true, force: true });

console.log("images");
const images = buildImages();
console.log("transforms");
const transforms = buildTransforms(images);
console.log("videos");
const videos = buildVideos();

rmSync(TMP, { recursive: true, force: true });
writeFileSync(
  MANIFEST,
  `${JSON.stringify({ images, transforms, videos }, null, 2)}\n`,
);

const total = [images, transforms, videos].map((list) => list.length);
console.log(
  `\n${total[0]} images, ${total[1]} transform cards, ${total[2]} videos -> ${MANIFEST.slice(ROOT.length + 1)}`,
);
