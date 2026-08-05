# @openinary/ui

## 0.8.0

### Minor Changes

- Give still images the same loading treatment videos already had, and stop the
  details sidebar reporting a failure on a preview that loaded.

  Dashboard thumbnails are generated in the browser and uploaded afterwards, so
  until one exists the server answers 404 on purpose rather than doing the work
  itself. Videos coped with that through `VideoThumbnail` — skeleton, fade-in,
  retry — while every still image was a bare `<img>` with no loading state at
  all: a tile stayed empty, or showed the browser's broken-image glyph, until
  something happened to remount it.

  `VideoThumbnail` is now the component behind both, at all four places that
  render an asset: the folder card preview, the grid tile, the list row and the
  sidebar preview. Nothing in it was ever video-specific. Each of those sites had
  already grown two branches identical apart from the tag, so all four collapse
  to a single call.

  Two fixes to the component itself came with that:
  - **The retry ladder reached 6s (1s/2s/3s), which is shorter than generation
    takes.** Thumbnails are produced a few at a time, so in a large upload batch
    the last ones are minutes away and those tiles used to land on "Thumbnail
    unavailable" permanently. It now backs off to roughly a minute, and the end
    of the ladder is what "out of retries" means rather than a separate counter
    to keep in step with it.
  - **A pending retry could outlive the tile that scheduled it.** The grid is
    virtualised, so scrolling past a loading thumbnail destroys it while its
    timer is still armed. The timer is now cleared when the source changes or
    the component unmounts.

  `AssetPreview` loses its local state machine entirely. It used to remember
  which URL had failed and never cleared that flag, so once a preview 404'd —
  which it does by design while the thumbnail is still being generated — the
  error was true for that URL forever: the image appeared on a later attempt and
  painted underneath "Failed to load preview", and reselecting the asset brought
  the message straight back with no race involved. The shared component clears
  its error the moment a retry succeeds.

  `VideoThumbnail` takes an optional `errorLabel` so the sidebar can keep saying
  "Failed to load preview" where "thumbnail" would be the wrong word. Its video
  preview now uses `object-contain` like the still preview beside it, instead of
  cropping to fill.

## 0.7.0

### Minor Changes

- e6beffe: Percent-encode storage paths in every URL the package builds.

  Paths were interpolated raw into the `/t/` delivery, preview and thumbnail
  URLs and into the `/video-status` poll, so a filename containing `#` or `?`
  truncated the URL: the browser read everything after it as a fragment or
  query, and the request that reached the server was for the part before it.
  A video uploaded as `The #1 clip.mp4` was fetched as `The ` and 404'd, with
  no broken thumbnail to explain why.

  The one-off `split("/").map(encodeURIComponent).join("/")` that the API calls
  already used is now a single exported `encodePath` helper, used everywhere a
  path becomes part of a URL.

### Patch Changes

- a0256d8: Fold four fixes that had been living as a downstream `pnpm patch` back into
  the source:
  - **AssetPreview no longer gets stuck on a grey square.** Its loading state
    was reset in an effect keyed on `previewUrl`, but `usePreloadMedia` warms
    the same URL - on a revisit the cached `<img>` fired `load` before the
    passive effect ran, which then flipped loading back on with no event left
    to clear it. State is now keyed by URL.
  - **Folder uploads filter by accepted type.** `webkitdirectory` ignores the
    input's `accept`, so picking a folder handed over every file inside it and
    one stray `.txt` made the API reject the whole batch. It now runs through
    the same `validateFile`/`DEFAULT_ACCEPT` check as the dropzone.
  - **Toasts stay centred.** `!w-fit` dropped the width sonner positions
    against, so the pill drifted off-centre as its text changed length.
  - **Settings dialog is roomier** (600x750), and the empty state's trailing
    arrow uses a left margin rather than a right one.
