# FINAL storyboard (director's cut): "One photo, every version"

This document is the binding spec. It is a DELTA over `concept_A.md` (same folder): everything in concept_A.md applies EXCEPT what this file changes. Where the two disagree, this file wins. Read concept_A.md fully first, then this file.

Film: 1920x1484, 60 fps, 120 BPM (beat 30 f, bar 120 f, 8th 15 f, 16th 7.5 f), **9 bars = 1080 frames = 18.0 s**, seamless loop (f1079 flows into f0). Composition id `Film`, durationInFrames 1080. Audio sample index = f x 800 at 48 kHz; one loop = 864,000 samples.

Binding rules carried from the research (brand.md section 7, copy rules): no em dash or en dash anywhere (on screen, in code comments, in file names). Only true claims. Every URL valid per brand.md section 3. The only "free" wording is `free plan, no card required`.

---

## 0. What changed vs concept A (summary)

1. **World is neutral, not warm** (on-brand with openinary.dev): ground `#FAFAFA`, static grain (no boil), neutral greys. Table in section 1.
2. **Upload is truthful**: no dashed drop slot in the grid (the Cloud grid has no drop target). The window rises with the real **Upload Files dialog** open; the card is dropped on its dropzone, becomes the file row, uploads, the dialog closes and the new tile is inserted in the sorted grid (others slide one slot), the sidebar tree row inserts at its sorted slot. Bars 1 to 2 re-timed (section 3).
3. **Legibility**: URL pill Geist Mono 52 px (was 44); plain-English labels under committed params (`width`, `height`, `round`, later `format`, `start 2s`, `end 6s`), Geist 500 30 px `#737373`; dimension badge 30 px; CTA pill mono 64 px; CTA sub-line 48 px.
4. **Copy**: `change the url` rewrites itself to `change the file` at the r_max moment (delete `url` 1 f per char, type `file`). `open source` is REMOVED (the hero H1 right above the slot already says it): the stencil and flood moment is wordless. New line `video too`.
5. **Caret is ink `#0A0A0A`, not red** (one red system per frame: the selection + its badge + ruler bands count as one system; the dropzone hover red is alone in its frames).
6. **Bar 6 rebuilt** (formats that actually change something): the rail lands on `w_1500,f_webp` with its true size, then flips to `w_1500,f_avif`; honest dimensions shown in plain numbers (`6883 × 5162 · 2.81 MB` before, `1500 × 1125 · 85.53 KB` then `60.17 KB`), `98% smaller`.
7. **New bar 7: video** (honest first hit). Rail pans to a video card `blossom.mp4`: first request shows a **Processing** state for one beat (music goes band-pass "radio"), then it resolves on beat 3 with the kick: the trimmed clip plays (`so_2,eo_6`), trim bar handles snap to 0:02 and 0:06, meta `MP4 · 1280 × 720 · 0:04`. Slot word `video too`.
8. **A's bars 7 and 8 become bars 8 and 9** (shifted +120 f) with a longer CTA hold (about 54 f fully formed and still) and a faster burst (18 f).
9. **A real camera**: slow drifts during holds (section 2.3) and ruler parallax at 20%.
10. **Token commits are melodic**: every param commit plays an FM bell tuned to the current chord.
11. **One source of truth for sync**: `src/timeline.ts` exports every event frame, and `public/cues.json` (generated from it by `scripts/export-cues.ts` or written alongside it) lists every sound cue with frame, type, params, level and pan. The audio script reads cues.json. Never hard-code a frame in two places.
12. Ray origin: do NOT trust A's R = (51.22, 54.12) blindly. The build judge measured R = (51.22, 55.41) as the intersection of the 10 ray-wedge midlines (residual 0). Recompute R from the logo paths in code (least squares on the ray edge lines, or the wedge midlines), print it, assert it, and derive u vectors, F0 offsets and placements from it. The F0 constraint is what matters: at F0, R is at screen (960, 720), all seven shards fully inside the frame line, and the photo card centred on R.

---

## 1. Visual world (replaces concept A 2.1 and 2.2 colours)

| Token | Value | Use |
|---|---|---|
| ground | `#FAFAFA` | the table |
| grain | static screen-space luminance noise, sd 1.2/255, feature about 1.5 px, one 2048x2048 PNG (alpha noise, multiply). NEVER re-offset: identical on every frame (seam-safe, compresses well). | P0 |
| ruler band / corner | `#F4F4F4` at 92% / `#EFEFEF` | HUD, 36 px bands top and left |
| ruler tick / numbers / edge | `#D0D0D0` / `#A3A3A3` Geist Mono 400 10 px / `#E5E5E5` | minor every 20 px (7 px long), major every 100 px (14 px), numbers every 200 px |
| frame line | 1 px `#E8E8E8` inset 72 px | static |
| cell / guide | `#F0F0F0` / 2 px `#E6E6E6` | wall, collapse column |
| idle handle | 20 px white, 2 px `#D0D0D0` | |
| brand red | `#FC1F1C` | shards, selection (2 px) + selected handles (14 px white, 2 px red) + dimension badge + ruler extent bands `rgba(252,31,28,0.10)` + dropzone hover + flood |
| ink | `#0A0A0A` | words, UI text, params, caret |
| typing grey / exit grey | `#CFCFCF` / `#E0E0E0` | typewriter ramp start / word exit |
| UI muted / URL host | `#737373` / `#8A8A8A` | |
| UI border / hairline | `#E5E5E5` / `rgba(0,0,0,0.08)` | |
| sidebar / active nav / group label | `#FAFAFA` / `#F5F5F5` / `#4F5656` | dashboard (window fill white, sidebar `#FAFAFA` separated by its 1.5 px divider) |
| success | `#16A34A` | CheckCircle2 in the upload row only |
| shadows | as concept A 2.2 | |

Everything else in concept A section 2 stands (depth planes, pixel honesty rules, no motion blur, no AI or effects affordances).

Fonts: LOCAL ONLY. Copy `/Users/florianheysen/Library/Fonts/GeistVariableVF.ttf` and `GeistMonoVariableVF.ttf` into `public/fonts/`, load with `@remotion/fonts` `loadFont({family, url: staticFile(...), weight: '100 900'})` and block rendering until loaded. Never fetch Google Fonts. Numbers that roll (counters, badges, odometers) use `font-feature-settings: "tnum"`. Any glyph not in Geist (e.g. U+2713 check) is replaced by a lucide icon. `×`, `→`, `…`, `·` are present in Geist.

Icons: `lucide-react` (pin the version in package.json). Verify every icon name exists before use.

### 2.3 Camera drifts (new)
- Bar 1 to 2 dashboard (f100 to f160): world zoom 1.000 → 1.015 about the window centre, linear. Imperceptible individually, it keeps the frame alive.
- Bar 3 holds (f256 to f359): zoom 1.00 → 1.035 anchored on the photo frame centre (960, 760), linear; the URL pill and slot word are HUD (not zoomed).
- Bar 5 wall: marquee already moves; no extra drift.
- Bar 6 to 7 rail holds: rail drifts -0.6 px/f between pans.
- Bar 9 CTA hold (f990 to f1044): lockup + CTA group zoom 1.00 → 1.02 about (960, 742), linear.
Rulers respond at 20% of zoom and pan (concept A 2.1) everywhere.

---

## 2. Master timeline (replaces concept A 3.1)

| Bar | Frames | Chord | Shots | Slot word | Visual accents |
|---|---|---|---|---|---|
| 1 | 0-119 | Abmaj7 | S1 F0 + fling, S2 grab + window with Upload dialog rises, drop | `upload once` f61 | f0 hold, f18 fling, f45 grab, f61 window velocity peak, f88 dropzone hover, f105 drop |
| 2 | 120-239 | Eb/G | S3 upload + dialog close + grid insert, S4 click + dive, S5 URL | (K1 out f150) | f132 Uploaded, f138 dialog closes, f162 tile click, f186 dive peak, f208 full bleed, f210 music re-entry, f226-f236 keys |
| 3 | 240-359 | Bb | S6 keystrokes | `change the url` f252, rewritten to `change the file` f318-f328 | f240 snap (w_600), f283 crop (h_600), f313 round (r_max) |
| 4 | 360-479 | Cm7, G on beat 4 | S7 slot machine | (K2 out f446) | host collapse f360-f372, 18 swaps f368-f477, stutter from f450 |
| 5 | 480-599 | Ab(add9) | S8 wall, S9 collapse whip | hero `every size` f484 | f480 DROP, f481 pull-back peak, f597 whip peak |
| 6 | 600-719 | Cm7 | S10 rail: webp → avif, 98% smaller | `every format` f606, `98% smaller` f660 | f590-f630 rail lands, f616 counter rolls, f645 f_webp → f_avif flip, f660 music re-entry |
| 7 | 720-839 | Bb | S11 video (processing → trim plays) | `video too` f782 | f736 pan peak, f744 Processing chip, f780 resolve + kick |
| 8 | 840-959 | Eb/G | S12 stencil + flood, S13a mark into lockup | (wordless) | landings f855, 863, 870, 878, 885, 893; top shard f900; flood peak f916; lockup peak f938; letters f946-f969 |
| 9 | 960-1079 | Ab(add9) | S13b CTA + click, S14 burst into F0 | `try openinary cloud` f960 | CTA formed f990, click P f1030 / release f1037, exit f1044, blink f1057, burst f1058-f1076, static f1076-f1079 |

---

## 3. Shots (only changed shots are specified; S1, S6 (except the listed deltas), S7, S8, S9 follow concept A exactly)

### S1 · f0-f54 (as concept A S1)
Unchanged, with the recomputed R and u vectors (see item 12). Photo card `hills-1000.jpg` 480x360 on R, file chip `hills.jpg · 2.81 MB`.

### S2 · f14-f105 · Grab, the dashboard rises with the Upload dialog open
Window geometry as concept A S2 (1663x1228 at x 129, top at rest y 548, radius 24, 1.5 px `#E4E4E3`, window shadow), same sidebar, header and grid chrome, with these differences:

**Grid (window-local coords; 4 columns x 410 / 720 / 1030 / 1340, tile 286, gap 24; row 1 y 139-425, row 2 y 449-735)**
- Row 1 = folders section: r1c1 `New folder` dashed tile (1.5 px dashed `#D4D4D4`, `Plus` 24 px + `New folder` Geist 400 19 `#737373`), r1c2 `Videos` folder tile (cherry-blossom poster cover, bottom gradient, `Videos` / `1 item` white).
- Row 2 = files, sorted alphabetically. BEFORE the upload: `portrait.jpg` (c1), `product-animation.mp4` (c2, 2d-animation poster + a small `Play` badge), `product-shoot.jpg` (c3), c4 empty. AFTER the upload (from f140): `hills.jpg` (c1), `portrait.jpg` (c2), `product-animation.mp4` (c3), `product-shoot.jpg` (c4).
- Sidebar tree (42 px pitch) BEFORE: `Videos` folder (y 462), `portrait.jpg` (504), `product-animation.mp4` (546), `product-shoot.jpg` (588). AFTER: `Videos`, `hills.jpg` (504, inserted), then the three others slide down 42 px.

**Upload dialog (open from the moment the window appears until f138)**: veil over the whole window content (not the frame) `rgba(10,10,10,0.22)`. Dialog 760x500, white, radius 18, 1.5 px `#E5E5E5`, dialog shadow `0 24px 64px -16px rgba(0,0,0,.25)`, centred at screen (960, 900) at rest (window-local (831, 352)); it rides with the window (it is inside it).
- Title `Upload Files` Geist 600 26 ink at (inset 32, 30); `X` 22 px `#737373` top-right.
- Dropzone: inset 32, top 84, 696x236, radius 14, 1.5 px dashed `#D4D4D4` (8/6), fill `#FAFAFA`. Centred content: `UploadCloud` 40 px `#737373`; `Drag & drop files here, or ` + `browse` (underlined) Geist 400 22 `#0A0A0A`/`#737373`; `Up to 50.0 MB per file` Geist 400 18 `#A3A3A3`.
- File list area: top 340 (empty until the drop).
- Footer: right-aligned ghost `Clear` + primary `Upload` (ink fill, white text, radius 10, Geist 500 20), bottom inset 28.

| Element | Property | From → to | Frames | Easing |
|---|---|---|---|---|
| cursor | tip path (quadratic, control (1400, 1300)) | (1990, 1580) → (1100, 760) | f14-f40 | bezier(0.25, 0.1, 0.1, 1) |
| cursor | press (grab) P = f45, held to f105 | 1 → 0.86 | f41-f45 | press grammar (concept A 3.0) |
| card | scale / rotate / shadow | 1 → 1.035 / 0 → -2.5° / card → lifted | f45-f55 | SITE |
| window (with dialog) | translateY | +1200 → 0 | f50-f100 | RISE (peak about 91 px/f at f61) |
| card | centre | (960, 720) → (960, 842) (dropzone centre) | f60-f102 | DRAG |
| card | size | 480x360 → 300x225 (cover) | f60-f102 | DRAG |
| file chip | opacity | 1 → 0 | f60-f72 | linear |
| cursor | follows the card (tip offset (140, 40) scaled with the card) | | f60-f102 | |
| dropzone | hover state when the card centre enters it | border 2 px dashed `#FC1F1C`, fill `rgba(252,31,28,.04)`, `UploadCloud` + text go ink | f88 (hard) | |
| K1 | typewriter `upload once` (slot baseline 318) | | f61-f71, black by f83 | typewriter |

Note the slot word sits above the window (window top 548 at rest), exactly as A.

### S3 · f105-f160 · Drop, upload, dialog closes, the tile is inserted
| Element | Property | From → to | Frames | Easing |
|---|---|---|---|---|
| cursor | release | 0.86 → 1 | f105-f111 | SITE |
| dropzone | hover state off | | f105-f110 | linear |
| file row (dialog-local top 340, inset 32, 696x72) | slide in / opacity | y +10 → 0 / 0 → 1 | f105-f113 | SITE |
| card → row thumbnail | FLIP | 300x225, -2.5°, r 14 → 56x56 cover at the row's left (inset 12), 0°, r 10 | f105-f119 | FLIP spring |
| row text | `hills.jpg` Geist 500 22 ink; `2.81 MB` Geist Mono 400 18 `#737373` under it | | from f110 | |
| progress bar | width (right part of the row, 300x6, r 3, track `rgba(0,0,0,.08)`, fill ink) | 0 → 300 with 2 f stalls at 40% (f116-f117) and 75% (f125-f126) | f108-f132 | bezier(0.4, 0, 0.2, 1) |
| status | progress bar out (4 f), `CheckCircle2` 22 px `#16A34A` + `Uploaded` Geist 500 20 `#16A34A` pops in (scale 0.6 → 1, badge spring) | | f132-f140 | |
| dialog | scale / opacity (close) | 1 → 0.96 / 1 → 0 | f138-f148 | bezier(0.4, 0, 1, 1) |
| veil | opacity | 1 → 0 | f138-f150 | linear |
| grid row 2 | `hills.jpg` tile appears at c1 (scale 0.94 → 1, opacity 0 → 1); the other three FLIP one slot right | | f140-f156 | FLIP spring, 2 f stagger left to right |
| sidebar tree | `hills.jpg` row inserts at y 504 (opacity 0 → 1, y +8 → 0); rows below slide +42 | | f140-f150 | SITE |
| cursor | tip | (1100, 862) → hills tile centre (screen (682, 1140)) | f140-f158 | SITE |
| K1 | exit | ink → `#E0E0E0` | f150-f158, gone f159 | linear |

### S4 · f158-f208 · Click the tile, dive through it
Same mechanics as concept A S4, re-anchored and re-timed:
| Element | Property | From → to | Frames | Easing |
|---|---|---|---|---|
| cursor + tile | press P = f162, release f169 | press grammar | f158-f176 | |
| camera | anchor A = hills tile centre (screen at rest (682, 1140)); S (682, 1140) → (960, 742); z 1 → 5.19 (log) | | f164-f208 | PUSH (peak about f186) |
| tile mask | world width 286 → 381 (4:3) / radius 8 → 0 / border 1 → 0 | | f172-f202 | SITE |
| all other window UI + window fill + sidebar | opacity 1 → 0 (dissolve to the ground) | | f178-f192 | linear |
| cursor | opacity 1 → 0 | | f172-f182 | linear |
At f208 the tile is exactly the full-bleed photo 1979x1484 centred on (960, 742), identical to scene B's first frame. Use `hills-2400.jpg` inside the tile from the start.

### S5 · f204-f239 · The URL arrives
As concept A S5 with: pill slides in f204-f222 (SITE, +140 → 0, opacity over first 6 f); caret (ink) appears f222 after `/t/`, blinks on 8ths; keys `w` `_` `6` `0` `0` `/` at f226, 228, 230, 232, 234, 236 (unchanged).
URL pill spec (replaces A's): centre (960, 1276), height 108, radius 26, white, 1.5 px `#E5E5E5`, pill shadow. Left padding 36, lucide `Link2` 32 px `#8A8A8A`, gap 18, text Geist Mono 500 **52** (advance 31.2 px/char, tracking 0): host `cdn.openinary.dev/…/t/` in `#8A8A8A`, params ink, `/hills.jpg` `#8A8A8A`, right padding 40. Width = 36 + 32 + 18 + n × 31.2 + 40 (spring-follows the text).
Plain-English labels: under the params, centred under each committed param group, Geist 500 30 `#737373`, 14 px below the pill bottom, connected by a 1 px `#D4D4D4` 10 px tick; each label enters with the site's blur-slide (y 12 → 0, blur 4 → 0 px, opacity 0 → 1, 13 f, SITE) 2 f after its reaction starts.

### S6 · f238-f359 · Keystrokes change the file (concept A S6 with deltas)
- Reaction frames unchanged: `w_600` snap f238-f256 (hit f240), `,h_600` keys f270-f281 + crop f283-f299 with overflow ghost, `,r_max` keys f300-f311 + round f313-f329.
- Labels: `width` at f242, `height` at f285, `round` at f315.
- Dimension badge: Geist Mono 500 **30**, height 46, radius 10, red fill, white text, 18 px under the frame, odometer digits (tnum).
- K2 `change the url` typed f252-f265 (black by f277). **Rewrite**: at f318 the caret-less delete removes `l`, `r`, `u` at f318, f319, f320 (each char greys to `#E0E0E0` for 1 f then disappears; the word stays centred via the pre-reserved layout rule: centre the FINAL word width for the whole rewrite, do not re-centre per char... acceptable alternative: smoothly re-centre with SITE over 8 f), then types `f` `i` `l` `e` at f322, 323.5→324, 325, 326.5→327 (1.5 f cadence), black by f340. Final `change the file` holds to f446.
- Camera drift f256-f359 (section 2.3).
- Poster frame = **f345** (circle, URL `cdn.openinary.dev/…/t/w_600,h_600,r_max/hills.jpg`, labels width/height/round, `change the file`).

### S7 · f360-f479 · Slot machine (concept A S7 with deltas)
- f360-f372: labels exit (opacity 1 → 0, 6 f); the host `cdn.openinary.dev/` collapses (width and opacity → 0, SITE 12 f) so the pill shows `…/t/` + params + `/hills.jpg` (widest state fits: 39 chars × 31.2 = 1217 px).
- Swap frames, states and order exactly as A. Frame morphs, badge swaps, CREEP push 1 → 1.12, K2 exit f446-f454, freeze f478-f479.

### S8, S9 · f480-f630 (concept A, unchanged)
Wall rows are built as at least 3 seamless repeats of their sequence centred on the anchor tile (the marquee integral from f480 to f597 is about 414 px and must never expose a cell edge). The whip and the rail's LAND entry must match speeds on the handoff frame (rail enters at the whip's end speed). The rail now lands card **V1** at the centre (see S10), not V7.

### S10 · f590-f719 · Every format, 98% smaller (replaces A's S10 and S11)
**Rail layout at rest (f630)**: cards 900 px apart (centre pitch), vertical centre y 800. Centre card V1: 800x600 (the w_1500 output at 4:3) at (960, 800) → x 560-1360, y 500-1100, square corners, hairline, card shadow. Format badge inside top-left inset 20: white 92%, h 44, r 10, Geist Mono 500 26 ink. Left neighbour V0 (x 60 centre, cropped by the frame): `w_600,h_600,r_max` output (the circle, 600x600, from the wall: continuity). Right neighbour V2 at x 1860: the video card (poster, dimmed, see S11).
**Label chip** under the card, top 1128: white, 1.5 px `#E5E5E5`, radius 14, Geist Mono 500 36: `w_1500,f_webp` (then `w_1500,f_avif`). Plain labels under it (Geist 500 30 `#737373`): `width` under `w_1500`, `format` under `f_...`.
**Size meter** (right column of the same row, right-aligned to x 1360, or below the label chip at top 1230: choose the layout that keeps every element ≥ 30 px and inside the frame line; recommended below):
- Row A (top 1232): before-line `hills.jpg  6883 × 5162  2.81 MB` Geist Mono 400 28 `#8A8A8A`, left at x 560.
- Row B (top 1276): track 800x10, r 5, `#E5E5E5`; ink fill anchored left.
- Row C (top 1302): after-line, left `1500 × 1125` Geist Mono 500 32 ink, right-aligned at x 1360 the counter Geist Mono 500 44 ink tnum.

| Element | Property | From → to | Frames | Easing |
|---|---|---|---|---|
| rail | LAND entry (continues from S9) | V1 centre x 2360 → 960 | f590-f630 | LAND |
| K4 `every format` | typewriter | | f606-f617, black by f629; exit f640-f648 | |
| size meter | opacity / y | 0 → 1 / 10 → 0 | f612-f620 | SITE |
| counter | bytes 2,950,577 → 87,582, printed `2.81 MB` → `85.53 KB` (two decimals always) | | f616-f640 | INOUT |
| bar fill | width 800 → 23.7 | | f616-f640 | INOUT |
| param | odometer `f_webp` → `f_avif` (8 f roll) + badge `WEBP` → `AVIF` hard swap | | f645-f653 | SITE |
| counter | 87,582 → 61,613, `85.53 KB` → `60.17 KB` | | f648-f664 | INOUT |
| bar fill | 23.7 → 16.7 | | f648-f664 | INOUT |
| K5 `98% smaller` | typewriter (on the music re-entry) | | f660-f670, black by f682 | |
| hold | `60.17 KB`, `98% smaller`, `w_1500,f_avif` all clean and still | | f682-f716 (plus the build-up before) | |
| K5 | exit | | f716-f724 | linear |
Byte values from `apps/cloud/web/src/components/playground/demo-manifest.json` (verify: landscape original 2,950,577 B, w1500 webp 87,582 B, w1500 avif 61,613 B; 1 - 61613/2950577 = 97.9% → `98% smaller`). Print KB as bytes/1024 with 2 decimals, MB as bytes/1048576 with 2 decimals.

### S11 · f720-f839 · Video too (new)
Video card V2: `blossom.mp4` = `apps/cloud/web/public/demo/videos/cherry-blossom/720p.mp4` (1280x720, 25 fps, 14.08 s) and its `poster.webp`. Card 800x450 at rest centre (960, 800) → x 560-1360, y 575-1025, square corners, hairline, card shadow.
| Element | Property | From → to | Frames | Easing |
|---|---|---|---|---|
| rail | translateX | 0 → -900 (V2 to centre) | f720-f752 | RAIL (peak about f736) |
| size meter + V1 label | exit with the rail (they belong to V1) | | | |
| V2 label chip (top 1060) | `so_2,eo_6/blossom.mp4` Geist Mono 500 36; plain labels `start 2s` under `so_2`, `end 6s` under `eo_6` | appear with the card, labels blur-slide at f784 | | |
| V2 state A (processing) | poster frame at 55% brightness (overlay `rgba(255,255,255,.45)`), centred chip: white pill h 56, r 28, `Loader2` 26 px spinning (360°/24 f) + `Processing` Geist 500 26 ink | chip pops f744-f750 (scale 0.8 → 1, badge spring) | f744-f779 | |
| V2 resolve | chip scale 1 → 0.8 + opacity → 0 (5 f); overlay → 0 (8 f); `<OffthreadVideo>` (or @remotion/media Video) starts playing at source time 2.0 s from f780, 1x speed | | f780 | SITE |
| meta chip (inside card, top-left inset 20, like the format badge) | `MP4 · 1280 × 720 · 0:04` | pops f784 | | SITE |
| trim bar (below the label chip, top 1150, x 560-1360) | track 800x10 r 5 `#E5E5E5` = the 14 s source; two ink handles (6x28, r 3) start at the ends and snap to 2/14 and 6/14 of the track; the kept segment fills ink, the rest stays grey; time ticks `0:02` / `0:06` Geist Mono 400 24 `#737373` above the handles | | f780-f796 | SNAP |
| K6 `video too` | typewriter | | f782-f791, black by f803; exit f826-f834 | |
Honesty: the output is 1280 × 720 (auto-downscaled to 720p max), 4 s long; the first request is queued (Processing), which is why it is shown. No 4K, no instant claim.

### S12 · f837-f926 · The stencil (concept A S12 shifted by +120, with deltas)
- All of A's S12 frames +120: E f837-f855, C f845-f863, B f852-f870, A f860-f878, D f867-f885, F f875-f893 (landings f855, 863, 870, 878, 885, 893), G MORPH f860-f900, G crop f900-f908, flood f910-f924 (peak f916).
- Sources: E flies from the rail's right side (an off-screen rail card V3, a `ar_16:9,c_fill,w_800` hills output), F from the left neighbour V1 (hills `w_1500,f_avif`), C, B, A, D fly in from R + 1400·u (hills outputs `w_600,h_600`, `w_480,h_600`, `w_600,h_600,r_max`, `w_600,h_600,c_pad,b_white`).
- G (top shard) MORPHs from the centre card, which is now the VIDEO card V2: during the MORPH its content crossfades from the playing video to the global hills stencil (f866-f886, linear), so from f900 to f910 the one photo is seen through the whole mark.
- NO slot word here (A's `open source` removed). The slot stays empty from f834 to f960.

### S13 · f926-f1044 · Lockup, CTA, click (concept A S13 re-timed)
Final layout: lockup (logo.tsx SVG at 1.75x = 730x182) centre (960, 690) → x 595-1325, y 599-781. Slot word K7 baseline 318 (Geist 600 160). CTA pill centre (960, 930), height 124, radius 30, white, 1.5 px `#E5E5E5`, pill shadow: `app.openinary.dev` Geist Mono 500 **64** ink + 18 px gap + `ArrowUpRight` 38 px ink, padding 0 46. Sub-line `free plan, no card required` Geist 400 **48** `#737373`, centred, baseline 1086.
| Element | Property | From → to | Frames | Easing |
|---|---|---|---|---|
| mark | k / origin: stencil placement → lockup placement | | f926-f956 | CARD (peak f938) |
| wordmark letters (9, from `getSubpaths` of the wordmark path grouped by bbox centre; counters stay in their letter) | letter j appears at f946 + [0, 2, 5, 8, 11, 14, 17, 20, 23][j]; opacity 1 at once; translateX +40 → 0 over 20 f | | f946-f989 | bezier(0, 0.5, 0.1, 1) |
| K7 `try openinary cloud` | typewriter (19 slots, 1 f) | | f960-f978, black by f990 | |
| CTA pill | y +40 → 0 / opacity 0 → 1 | | f966-f986 | SITE |
| sub-line | y 12 → 0 / opacity 0 → 1 | | f976-f988 | SITE |
| lockup + CTA group | slow zoom 1.00 → 1.02 about (960, 742) | | f990-f1044 | linear |
| cursor | tip (quadratic, control (1500, 1300)) | (1990, 1580) → (1180, 950) | f1000-f1022 | bezier(0.25, 0.1, 0.1, 1) |
| pill | hover | bg `#FFFFFF` → `#F7F7F7` (hard) | f1018 | |
| cursor + pill | press P = f1030 (pill 0.97, bg `#F0F0F0`), release f1037 | press grammar | f1026-f1045 | |
Everything (K7, lockup, pill, sub-line) is fully formed and still from f990 to f1044 (54 f), and legible from about f982.

### S14 · f1044-f1079 · Exit and burst into F0 (concept A S14 compressed)
| Element | Property | From → to | Frames | Easing |
|---|---|---|---|---|
| K7, pill, sub-line | exit (grey / fade + sink 12 px) | | f1044-f1052 | linear / SITE |
| wordmark | letters retract right to left, 1 f stagger, 4 f fade, +30 px | | f1044-f1056 | bezier(0.7, 0, 0.84, 0) |
| cursor | leaves to (2000, 1600) | | f1044-f1060 | EXITIN |
| mark | recentre + grow: lockup placement → k 4 with R on (960, 720) | | f1044-f1056 | INOUT |
| selection | 3 px red rect around the mark + 14 px handles; draw-on left f1054, top f1055, right + bottom f1056 | | f1054-f1056 | hard |
| selection | one-frame blink (gone) = the click accent | | f1057 | |
| shards | k 4 → 7 (anchored at R) + offsets 0 → F0 offsets | | f1058-f1076 | BURST (peak about f1064) |
| photo card | scale about R 0.12 → 1, opacity 0 → 1 (first 6 f), shadow 0 → card | | f1060-f1076 | BURST |
| file chip | opacity 0 → 1, y 6 → 0 | | f1066-f1074 | SITE |
| everything | static, pixel-identical to f0 | | f1076-f1079 | |
Seam: f1076-f1079 + f0-f7 = 12 static frames. Verify `npx remotion still Film --frame=1079` vs `--frame=0`: mean abs diff < 0.5 level (the grain is static now, so it should be ~0).

---

## 4. Music (replaces concept A 5.1 table; A 5.2 lead lines shift as noted; A 5.3 levels stand; 5.4 circular render uses 1080 f = 864,000 samples, keep the middle of three loops)

| Bar | Frames | Chord (MIDI voicing) | Bass | Drums | Pad / lead | FX and automation |
|---|---|---|---|---|---|---|
| 1 | 0-119 | Abmaj7 (56 60 63 67) | Ab1 wide (±4 cents L/R) | none | pad, soft 16th gate (-6 dB, 60% duty); burst echoes wrap in (from the previous loop) | UI foley is the rhythm |
| 2 | 120-239 | Eb/G (55 58 63 67) | G1 | shaker 8ths from f150 (-18 dB) | pad | **HPF drop-out f188-f210** (400 Hz 24 dB/oct), instant full-range re-entry **f210** (beat 4) with pad re-attack; reverse pad swell ending exactly f210 |
| 3 | 240-359 | Bb (58 62 65 70) | Bb1 mono | kick 16ths 0, 6, 10, 14 (f240, 285, 315, 345); rim tock f270, f330 (-16 dB); closed hats 8ths | pad | token bells (FM 1:3.5, same as lead) on the commits: Bb5 f240, D6 f283, F6 f313, plus a soft Bb5 on the `change the file` rewrite at f322 |
| 4 | 360-479 | Cm7 (58 60 63 67) → G on beat 4 | C2 | muffled kick f360 only | pad gate deepens to -9 dB | build band-limited f360-f419 (HPF 350 Hz, LPF 2 kHz); f420-f449 filters open log + white-noise riser; **f450-f479 stutter-freeze** G3 196 Hz buzz, LPF 500 Hz → 4 kHz; hard cut f480 |
| 5 | 480-599 | Ab(add9) (56 60 63 70) | Ab1 mono, sidechain -3 dB | **DROP**: kick f480, 525, 555, 585; clap f510, f570; hats 8ths (open offbeats +2 dB) | lead M1 (A 5.2, same frames) | impact f480; HPF suck-out f585-f600, return f600 |
| 6 | 600-719 | Cm7 | C2 | as bar 5 + 16th hat ghosts -8 dB; clap f630, f690 | lead M2 (A 5.2, same frames) | **HPF suck-out f637-f660**, return **f660** (beat 3) with a clap flam (K5 `98% smaller`) |
| 7 | 720-839 | Bb (58 62 65 70) | Bb1 | kick f720, 765; clap f750; then from f780: kick f780, 810, 825; clap f810 | lead sparse: D6 f720, C6 f735; after f780: Bb5 f780, D6 f795, F6 f810 | **band-pass "radio" f750-f780** (300 Hz to 3 kHz, > 5 kHz -30 dB, sub -30 dB) during Processing; full slam back on **f780** (beat 3) with a soft impact (kick + sub bloom, no crash) |
| 8 | 840-959 | Eb/G (55 58 63 67) | G1 | kick, hats; clap f870, f930 | landing blips are the lead: Bb5 f855, C6 f863, D6 f870, F6 f878, G6 f885, Bb6 f893; Eb6 bell with the top-shard thock f900 | flood bloom f910-f924 (pad LPF 800 Hz → 6 kHz); no band-pass here (it moved to bar 7) |
| 9 | 960-1079 | Ab(add9) (56 60 63 70) | Ab1 at -12 dB | **drums out** at f960 (end-card breakdown) | CTA motif G5 f960, Bb5 f975, Eb6 f990 (delay as lead) | exposed UI click f1030/f1037; reverse swell f1040-f1058; **hard stop of all music f1044** (5 ms); burst f1058 (bell cluster Bb5 D6 F6 + sub bloom Bb1 + outward whoosh); quarter-note darkening echoes wrap into bar 1 |

Harmony loop: Abmaj7, Eb/G, Bb, Cm7 → G (stutter), Ab (drop), Cm7, Bb, Eb/G, Ab(add9), burst Bb-D-F cluster → Abmaj7 at f0.
Master: -14 LUFS integrated, -1 dBTP, LRA 5 to 7 LU, sub mono below 120 Hz from bar 3.

---

## 5. SFX cue sheet (derive `cues.json` from concept A section 6 with these mapping rules, then add the new cues)

Mapping of concept A cues:
- Cues 1 to 12 (f0 to f105): unchanged frames. Cue 11 (`card over the slot`) becomes `card over the dropzone`, same frame f88. Cue 12 (drop) and 13 (seat) unchanged frames, 13 is now "card lands in the dialog row" (softer, -14).
- Cue 14 (upload progress f108-f132): unchanged. Cue 15 (sidebar row) moves to **f142**. Cue 16 (uploaded pop) f132 unchanged.
- NEW 16a f138-f148 dialog closes: soft down-swish (noise BP 2 kHz → 700 Hz, 150 ms) -22. NEW 16b f140, 142, 144, 146 grid tiles FLIP one slot: 4 tiny tab ticks, -18, panned by tile x.
- Cue 17 (tile click) moves to **f162 / f169**. Cue 18 (push whoosh) becomes f164-f208 peak **f186**. Cue 19 (reverse swell) ends **f210**. Cue 20 (HPF drop-out) **f188-f210**. Cue 21 (pill slides in) **f204-f214**.
- Cues 22 to 45 (f226 to f700): frames unchanged EXCEPT: cue 23 adds the Bb5 token bell at f240; cue 27 adds a D6 bell at f283; cue 30 adds an F6 bell at f313; NEW cue 30a: `change the file` rewrite: 3 reverse micro ticks f318-f320 (-22) + 4 typing ticks f322, 324, 325, 327 (-12) + soft Bb5 bell f322 (-16). NEW 30b f360-f372 host collapse: micro zip (noise BP 3 kHz → 1 kHz, 120 ms) -24.
- Cues 39 to 45 (bar 6) are REPLACED by the new bar-6 cues below. Cues 46 to 68 (bars 7 and 8 of A) shift by **+120 frames** (so they fall in bars 8 and 9), EXCEPT: cue 46 (band-pass radio) is removed from bar 8 (it moved to bar 7); cue 53 (`open source` pop) is removed; A's S13/S14 cues are re-timed per section 3 (letters f946, 948, 951, 954, 957, 960, 963, 966, 969; K7 pop f960; CTA pill whoosh f966-f976; click f1030 / f1037; reverse swell f1040-f1058; music hard stop f1044; wordmark reverse ticks f1044-f1056; selection tick f1054; blink click f1057; burst whoosh f1058-f1076 peak f1064; bell cluster + sub bloom f1058; shard glints f1059-f1065; photo puff f1060-f1070).

New bar 6 cues (S10):
| Frame(s) | Event | Type | Synthesis hint | Level | Pan |
|---|---|---|---|---|---|
| f591-f630 | rail lands | slide air | noise BP 800 Hz to 2 kHz, 300 ms decay | -22 | +60 → 0 |
| f606 | `every format` | soft pop | chirp 900 → 1500 Hz 25 ms | -16 | C |
| f612 | size meter appears | micro whoosh | pink noise BP 1 to 3 kHz 150 ms | -26 | C |
| f616-f640 | counter rolls 2.81 MB → 85.53 KB | odometer + deflate | 12 ticks at accelerating then decelerating intervals, resonators stepping down 1 semitone each; sine 1200 → 400 Hz 400 ms at -24 | -18 | C |
| f645 | f_webp → f_avif flip | pitched tab tick + `tk` | resonators × 2^(5/12) + 6 ms 2 kHz | -10 | C |
| f648-f664 | counter 85.53 → 60.17 KB | short odometer | 6 ticks, 2 semitones lower than the previous run | -20 | C |
| f637-f660 | music | HPF suck-out | bus automation | | |
| f660 | `98% smaller` | soft pop + clap flam (music) | as above | -16 | C |
| f716-f724 | K5 exit | none | | | |

New bar 7 cues (S11):
| Frame(s) | Event | Type | Synthesis hint | Level | Pan |
|---|---|---|---|---|---|
| f720-f752 peak f736 | rail pan | short whoosh | pink noise raised cosine 250 ms peaking f736, BP 500 Hz → 2.5 kHz → 900 Hz, Q 2 | -12 | +60 → -60 |
| f744 | Processing chip pops | soft pop (lower) | chirp 700 → 1000 Hz 25 ms | -18 | C |
| f750-f779 | processing | spinner ticks | 8 very soft ticks every 3.75 f (1/32 notes), HP 6 kHz, inside the radio band-pass | -30 | C |
| f750-f780 | music | band-pass radio | bus automation | | |
| f780 | resolve | slam back + "ready" chime | kick + sub bloom (music) + FM bell Bb5+D6 dyad, tau 200 ms | -8 | C |
| f780-f796 | trim handles snap | two clacks | as A cue 27 (crop clack), at f786 and f790, panned -30 / +30 | -12 | ±30 |
| f782 | `video too` | soft pop | as above | -16 | C |
| f784 | meta chip pops | tab tick | as A cue 11 | -16 | C |

---

## 6. Build notes (additions to concept A section 7)

- Composition `Film`, 1080 frames. Keep `Test` composition out of the final Root (or keep but not default).
- Media to prepare in `public/media/` (with PIL / ffmpeg, from `/Users/florianheysen/openinary/apps/cloud/web/public/demo/`): `hills-2400.jpg` and `hills-1000.jpg` (from landscape/original.jpg), `portrait.webp` (portrait/w900.webp), `product-shoot.webp` (product/w900.webp), `blossom-poster.webp` (videos/cherry-blossom/poster.webp), `blossom.mp4` (videos/cherry-blossom/720p.mp4, re-encode to 60 fps CFR h264 if needed for frame-accurate seeking; or keep 25 fps and let OffthreadVideo handle it), `product-animation.webp` (videos/2d-animation/poster.webp).
- Scene handoff frames (must be pixel-continuous): f208 (dive → full bleed), f590-f600 (whip → rail), f837+ (rail → stencil), f1076-f1079 → f0 (seam).
- Every animated layer reads its numbers from `src/timeline.ts`. `public/cues.json` lists every sound cue (frame, type, params, level dB, pan) and is the only input the audio script uses for timing.
- Self-checks (assert-based, runnable with `npx tsx scripts/check.ts`): R recomputation, all seven F0 shard bboxes inside the frame line, URL strings valid against the parser grammar (regexes from brand.md section 3), no `—` or `–` in any string in `src/`, byte counts vs demo-manifest.json.
- Render: draft `npx remotion render Film out/draft.mp4 --scale=0.5 --muted`; final `npx remotion render Film out/film-video.mp4 --muted` then mux with `audio/score.wav` (tooling.md command c, with loudnorm off since score.py already masters; `-shortest`; check audio duration 18.000 s).
