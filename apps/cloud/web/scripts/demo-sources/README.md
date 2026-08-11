# Demo sources

Drop the source media here, then run, from the repo root:

```bash
node apps/cloud/web/scripts/build-demo-assets.mjs
```

The script resolves its own paths, so it works from any directory; only the
path you give it has to be right.

That writes every variant into `public/demo/` and rewrites
`src/components/playground/demo-manifest.json` with the real byte counts the
playgrounds display. Commit both, the script is never run at build time.

Needs `ffmpeg`, `cwebp` and `avifenc`:

```bash
brew install ffmpeg webp libavif
```

## What to provide

Filenames are fixed (the extension is free: `.jpg`, `.jpeg` or `.png`), because
the transform catalog picks its source by role: a smart-crop card needs the
portrait, not the product shot.

| Path | Role | What it needs to be |
|---|---|---|
| `images/product.jpg` | Compression showcase | A detailed subject on a plain background, **≥3000px wide**. Texture matters: a flat gradient compresses absurdly well and would make the "% smaller" figure a lie. |
| `images/portrait.jpg` | Smart crop + round corners | A face clearly **off-centre**, ≥2000px wide, so the crop has something to find. |
| `images/landscape.jpg` | Responsive + aspect ratio | Wide framing (landscape or architecture), ≥3000px wide. |
| `videos/*.mp4` | Video playground | ~10s, 1080p source. One is enough for v1; each extra one adds ~3 renditions to the repo. Filename becomes the slug. |

**Video sources are not kept.** They are tens of MB and nothing renders them,
only the three renditions in `public/demo/videos/` do. Once a video is built,
its source is deleted; all that survives is its byte count in the manifest, for
the "x% smaller" badge. The consequence: re-running this script without the
source back in `videos/` drops that video from the manifest and the Videos page
falls back to "upload your own". Put the file back before regenerating.

**Licensing:** these files ship publicly in the dashboard. Use media you own or
that is unambiguously CC0.

## Notes

- Anything missing is skipped with a warning rather than failing the run, and
  the playgrounds simply don't offer that source. An empty manifest is valid:
  the pages fall back to "upload your own file".
- Originals are copied through untouched, they're the "before" side of the
  comparison, so re-encoding them would distort the saving.
- The smart-crop card approximates `g_face` with a fixed upper-biased crop
  (server-side it is sharp's `attention` strategy, which ffmpeg can't
  reproduce). If you swap the portrait, tune the offset in the `smart-crop`
  entry of `build-demo-assets.mjs`.
