import rawManifest from "./demo-manifest.json";

/**
 * Everything the playgrounds render, produced by scripts/build-demo-assets.mjs
 * and served statically from public/demo. Nothing here ever touches the CDN:
 * the playgrounds must not wake the transform container.
 *
 * The manifest is committed with empty arrays until the demo sources land (see
 * scripts/demo-sources/README.md). Every consumer has to handle that - the
 * pages fall back to "upload your own file" and stay usable.
 */

export interface EncodedAsset {
  src: string;
  bytes: number;
}

export interface DemoImageVariant {
  width: number;
  height: number;
  webp: EncodedAsset;
  avif: EncodedAsset;
}

export interface DemoImage {
  role: string;
  label: string;
  hint: string;
  original: EncodedAsset & {
    width: number;
    height: number;
    format: string;
  };
  /** Widest first - the native width, then each step below it. */
  variants: DemoImageVariant[];
}

export interface DemoTransform {
  id: string;
  label: string;
  description: string;
  /** A real segment, checked against core's parser grammar. */
  segment: string;
  before: { webp: EncodedAsset; avif: EncodedAsset };
  after: { webp: EncodedAsset; avif: EncodedAsset };
}

export interface DemoVideoRendition extends EncodedAsset {
  id: string;
  label: string;
  segment: string;
  width: number;
}

export interface DemoVideo {
  slug: string;
  label: string;
  poster: string;
  /**
   * Metadata only, no `src`: the source video is not shipped. Its renditions
   * are what the UI plays, and all that's left of the original is the weight
   * the "x% smaller" badge compares against.
   */
  original: {
    bytes: number;
    width: number;
    height: number;
    duration: number;
  };
  renditions: DemoVideoRendition[];
}

interface DemoManifest {
  images: DemoImage[];
  transforms: DemoTransform[];
  videos: DemoVideo[];
}

// The committed manifest starts empty, which TypeScript infers as never[].
const manifest = rawManifest as unknown as DemoManifest;

export const demoImages = manifest.images;
export const demoTransforms = manifest.transforms;
export const demoVideos = manifest.videos;

/** Percentage saved against the original, rounded - "67% smaller". */
export function savingPercent(originalBytes: number, encodedBytes: number) {
  if (originalBytes <= 0) return 0;
  return Math.max(
    0,
    Math.round(((originalBytes - encodedBytes) / originalBytes) * 100),
  );
}
