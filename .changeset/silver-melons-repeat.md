---
"@openinary/ui": patch
---

Fold four fixes that had been living as a downstream `pnpm patch` back into
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
