# Builders' guide (shared engine)

Spec: `analysis/FINAL.md` (binding) over `analysis/concept_A.md`. Composition `Film`, 1920x1484, 60 fps, 1080 frames.

## Rules

- **Absolute frames.** Every scene reads `useCurrentFrame()` (film frame 0..1079), returns `null` outside `SCENES.X`, and is never wrapped in an offset `<Sequence>`. Every animated value is a pure function of that frame (no `Date`, no unseeded `Math.random`: use `random("seed")` from remotion; no network).
- **Frames live in `src/timeline.ts` only.** Read `T.S6.snap`, `K.K2`, `SOUND.*`, never type a frame number in a scene. If a frame you need is missing, ask the integrator (it must also reach `public/cues.json`).
- **Ownership.** Scene builder X may create files only under `src/scenes/X/` and edit only `src/scenes/SceneX.tsx`. Do NOT edit shared files (`src/lib/*`, `src/components/*`, `src/timeline.ts`, `src/Film.tsx`, `src/Root.tsx`, `scripts/*`, `public/*`). Need a change? Copy the primitive into `src/scenes/X/` and report it.
- **Copy.** No em dash or en dash anywhere (code, comments, strings, file names). Only true claims; every URL from `src/lib/variants.ts` (validated by `scripts/check.ts`).
- **Perf.** Lean DOM; no `filter: blur` on full-frame layers; images at their max on-screen size (`hillsFor(w)`); no `will-change` on zoomed layers.

## Commands (run in this folder)

```bash
npx tsc --noEmit                                              # typecheck (src + scripts)
npx tsx scripts/check.ts                                      # R, F0 bboxes, dashes, URL grammar, bytes, cues up to date
npx tsx scripts/export-cues.ts                                # rebuild public/cues.json from timeline.ts
npx remotion still Film out/f300.png --frame=300 --scale=0.5  # one frame (Read the PNG to look at it)
npx remotion render Film out/a.mp4 --frames=196-260 --scale=0.5 --muted
python3 scripts/sheet.py out/sheet.png 196 2 6 out/frames/*.png   # contact sheet with frame numbers
npx remotion still Lab out/lab.png --frame=0                  # primitive gallery (0 stencil+flood+rulers, 1 lockup+cursors+photos, 2 hero word)
npm run studio                                                # scrub in the browser
```
Extract frames for a sheet: `ffmpeg -i out/a.mp4 out/frames/f_%03d.png` (this ffmpeg has no drawtext; `sheet.py` draws numbers with PIL).

## Scene contract (`src/scenes/SceneX.tsx`)

```tsx
export const SceneB = () => { const frame = useCurrentFrame(); if (frame < SCENES.B.from || frame > SCENES.B.to) return null; ... };
export const selectionAt = (frame: number): Rect | null => ...;       // SCREEN rect -> red ruler extent bands
export const cameraAt = (frame: number): Camera | null => ...;        // drives the 20% ruler parallax
export const cursorAt = (frame: number): CursorState | null => ...;   // Film draws the cursor (layer P4)
```
Film stack: P0 `Ground` + `FrameLine` | world: SceneA, B, C, D (later on top) | `Rulers` | `SlotWords` | cursor | audio (`AUDIO_READY`). For rulers and cursor Film asks the active scenes, **latest start first**, and takes the first non-null answer (so during overlaps the newer scene wins as soon as it returns something). Anything that must sit above the rulers must go through `cursorAt`.

## Modules

### `src/timeline.ts`
`FPS BPM BEAT BAR EIGHTH SIXTEENTH FRAMES W H FRAME_LINE SAMPLE_RATE SAMPLES_PER_FRAME AUDIO_READY`; `bar(n)` (bar 1 = f0), `beat(n, b)`, `step16(n, i)`; `SCENES`, `HANDOFF`; `T.S1..T.S14` (every event frame, ranges are `[from, to]` tuples, plus spec geometry); `K.K1..K7` word scripts, `SLOT`, `HERO`, `SLOT_WORDS`, `TYPE`; `SOUND` (sound-only frames); `MUSIC` (bars, chords, drums as 16-step strings, lead notes with frames, bus automation). Example: `tween(frame, T.S6.snap, [1979, 600], E.SNAP)`.

### `src/lib/ease.ts`
`E.RISE DRAG PUSH SNAP SITE CREEP RELEASE WHIP COLLAPSE LAND RAIL FLY MORPH CARD INOUT BURST EXITIN FLOOD` (+ `CURSOR PROGRESS PRESS LETTER REVEAL LINEAR`), `SPRING.FLIP PILL BADGE`.
```ts
prog(frame, [f0, f1], E.SITE)                 // eased 0..1, clamped
tween(frame, [f0, f1], [v0, v1], E.SNAP)      // clamped value
keys(frame, [f0, f1, f2], [a, b, c], ease)    // multi-key
tweenColor(frame, [f0, f1], ["#FFFFFF", "#F7F7F7"])
springAt(frame, start, SPRING.FLIP, { from, to })
logZoom(p, z0, z1)                            // z0 * (z1/z0)^p
quad(t, from, ctrl, to)                       // cursor paths
```

### `src/lib/camera.ts`
`Camera = { zoom, tx, ty }` (screen = zoom * world + t). `anchorZoom(A, S, z)` CSS string (use `transformOrigin: "0 0"`), `cameraFromAnchor(A, S, z)`, `cameraTransform(cam)`, `worldToScreen`, `rectToScreen`, `compose(outer, inner)`, `parallax(cam, 0.2)`.
```tsx
const cam = cameraFromAnchor(T.S4.pushA, S, logZoom(prog(frame, T.S4.push, E.PUSH), 1, 5.19));
<div style={{ position: "absolute", inset: 0, transformOrigin: "0 0", transform: cameraTransform(cam) }}>{world}</div>
// and export cameraAt = (f) => the same cam
```

### `src/lib/tokens.ts`
`C` (every colour of FINAL section 1), `SHADOW.card lifted window pill dialog`, `cardShadow(t)`, `liftShadow(t)` (card to lifted), `FONT.sans / FONT.mono` ("Geist", "Geist Mono"), `TNUM`.

### `src/lib/fonts.ts`
Local Geist + Geist Mono (variable, 100..900) via `@remotion/fonts`. `measureText(text, { size, weight, family, trackingEm })` = advance width without the trailing letter-spacing. `useFontsReady()` (Film and Lab already gate on it, so any component under them can measure).

### `src/lib/icons.ts`
`Package Plug Image (alias ImageIcon) Video ChevronRight ChevronDown ChevronsUpDown PanelLeft Upload UploadCloud LayoutGrid List Square Folder FileImage FileVideo Plus Check CheckCircle2 Link2 ArrowUpRight Loader2 X Play` (lucide-react 1.49.0; `UploadCloud` = CloudUpload, `CheckCircle2` = CircleCheck, `Loader2` = LoaderCircle, `FileVideo` = FilePlay). `<Link2 size={32} color={C.host} />`.

### `src/lib/media.ts`
`MEDIA.hills2400 hills1000 hills600 portrait productShoot blossomPoster productAnimation` (`{ src, w, h }`), `BLOSSOM_MP4` (`media/blossom-60.mp4`: the 1280x720 25 fps source motion-interpolated to 60 fps, first 6.45 s; `<OffthreadVideo src={BLOSSOM_MP4} trimBefore={...} />`), `hillsFor(screenW)`.

### `src/lib/variants.ts`
`SOURCE`, `BYTES`, `outputOf(params)` -> `{ w, h, radius, pad, format }` (engine-honest), `TYPING`, `S7_STATES[0..9]`, `WALL.A1/A2/B1/B2`, `RAIL`, `STENCIL_SOURCES`, `VIDEO`, `CTA`, `PILL_HOST` (`cdn.openinary.dev/…/t/`), `PILL_FILE`, `pillUrl(params)`, `formatBytes(b)` (`2.81 MB`, `85.53 KB`, `60.17 KB`).

### `src/components/Photo.tsx`
```tsx
<Photo media={MEDIA.hills2400} w={600} h={450} x={660} y={535} radius={0} />        // fill: cover, centre
<Photo media={MEDIA.hills600} w={600} h={600} x={..} y={..} radius="max" />          // r_max ellipse
<Photo media={MEDIA.hills600} w={600} h={600} pad={1} />                            // c_pad,b_white (0..1 morphs)
coverRect(nat, box) / containRect(nat, box) / mixRect(a, b, t)                      // box-local image rects
```
Props: `imageRect` (override, e.g. a stencil alignment), `hairline`, `shadow`, `opacity`, `pos`, `style`. `r_N` radius is in output px: multiply by your display scale.

### `src/lib/type.ts` + `src/components/Typewriter.tsx` + `SlotWords.tsx`
Scripts are `WordScript` (`{ steps: [{ type, at, k? } | { del, at, k? }], exit?, size? }`): slot i at `at + round(i k)`, glyph 0.5 opacity on its frame then 1, `#CFCFCF` to ink over 12 f, delete = exit grey for 1 f then gone, exit = whole word to `#E0E0E0` over `[a, b]`, gone at b + 1. Centring uses the measured final width; a `del` re-centres with SITE over 8 f.
```tsx
<Typewriter script={K.K3} x={HERO.x} baseline={HERO.baseline} size={HERO.size} weight={600} trackingEm={HERO.trackingEm} />
// scene B owns the hero word; pass frame={...} to freeze or offset it; colors / rampFrames for URL-style typing
glyphsAt(script, frame) / compile(script) / typewriterLayout(script, opts)   // pure helpers
```
`SlotWords` (Film, layer P3) renders K1 K2 K4 K5 K6 K7 by itself: scenes never draw slot words.

### `src/components/Ground.tsx`, `Rulers.tsx`
`Ground` (#FAFAFA + static zero-mean grain), `FrameLine` (1 px #E8E8E8 inset 72). `Rulers({ camera, selection })`: Film calls it; you only feed `cameraAt` / `selectionAt`.

### `src/lib/framing.ts` + `src/lib/viewport.tsx` (16:9 variant `Film169`)
`Film169` (1920x1080) renders the same film through a per-frame framing camera: the world, slot words and cursor stay in the 1920x1484 design space inside a stage transformed by `output = (design - (960, cy)) * s + (960, 540)`; Ground, FrameLine and Rulers stay in output space. Keyframes (holds + transitions riding the film's own big motions) live in `framing.ts`; `scripts/check.ts` asserts the master is untouched, the seam lands at rest and the measured content sits inside the output frame line. Anything that reaches the frame edges or the frame line reads `useViewport()` (`visible`, `frameLine` in design coords; the master's are 0..1920 x 0..1484 and inset 72) instead of assuming 1920 x 1484.

### `src/components/Cursor.tsx`
`<Cursor x y scale opacity variant="arrow" | "pointer" | "grab" | "grabbing" />` (tip at x, y; 52 px arrow; scales about the tip; soft shadow). Return the same props from `cursorAt`.
```ts
const pr = press(frame, T.S13.press, { release: T.S13.release, targetMin: 0.97 });
// pr.cursor (1 -> 0.86 -> 1), pr.target (1 -> 0.97 -> 1), pr.darken (0.04 at P, 0 at P + 9), pr.depth
// grab held for a whole drag: press(frame, T.S2.grab, { release: T.S2.drop, releaseFrames: 6 })
```

### `src/lib/shards.ts` + `src/components/Mark.tsx`
Mark point p (mark units, 103.049 box) lands at `origin + k * p`. `R` = ray origin recomputed (least squares on 12 gap midlines) = **(51.219, 55.413)**. `SHARDS[id]` = `{ d, centroid, area, bbox, u, dist }`, `CLOCKWISE` = E C B A D F G.
`PLACEMENTS.F0` (k 7, R on (960, 720)), `.stencil` (k 8, origin (548, 388): box 548..1372 x 388..1212, R lands on (957.75, 831.31)), `.lockup` (k 1.75, origin (595.125, 599)), `.preburst` (k 4, R on (960, 720)). `placeR(k, S)`, `rScreen(p)`, `mixPlacement(a, b, t)` (R travels straight), `markBox(p, pad)`, `F0_OFFSET`, `F0_STATE`, `shardScreenBBox`, `shardScreenCentroid`, `shardTransform`, `shardScreenPath` (Mark.tsx), `MAX_R_DIST` (65.57 units).
`ShardState = { p?: Placement, d?: px along u, dx?, dy?, s?: scale about centroid, opacity? }`.
```tsx
<MarkShards placement={mixPlacement(PLACEMENTS.stencil, PLACEMENTS.lockup, prog(frame, T.S13.toLockup, E.CARD))} />
<MarkShards placement={PLACEMENTS.stencil} shards={{ E: { opacity: 1 }, G: { opacity: 0 } }}
  stencil={{ src: MEDIA.hills2400.src, rect: { x, y, w, h } /* or per shard */, opacity: { E: 1 } }} />
<MarkShards placement={PLACEMENTS.stencil} stencil={...} flood={{ r, feather: 48 }} />   // red layer masked by a disc at R
```
The stencil clips an `<Img>` (so Remotion waits for it) with CSS `clip-path: path()` in screen px; the red layer and flood are SVG. Flood `r` is the disc's outer edge, the 48 px feather sits inside it: a flood that covers every shard at k 8 needs `r >= MAX_R_DIST * 8 + 48` (about 573).
`<Wordmark placement letters={[{ opacity, dx, dy }] x 9} />` (O p e n i n a r y, `LETTERS` in `src/lib/wordmark.ts`), `<Lockup placement letters shards />`.

### `src/components/FileCard.tsx`, `F0Tableau.tsx` (the loop seam)
`<FileCard cx cy w h radius scale rotate opacity shadow media />` (defaults = F0 card 480x360 on (960, 720)), `<FileChip cx top opacity dy />`.
`<F0Tableau {...state} />` with `flingState(frame)` (S1, scene A) and `burstState(frame)` (S14 burst, scene D). Both return `{}` on f0..f7 and f1076..f1079, so the seam is pixel-identical (verified: f0 vs f1076 / f1079 diff = 0). Scene A S2 (lift, drag, shrink) should switch from `F0Tableau` to its own `FileCard` using the same defaults.

### Sound
`public/cues.json` = `scripts/export-cues.ts` output (79 SFX cues + 9 music bars). If your picture moves an event, the frame must change in `timeline.ts` (and the cues regenerate), never only in your scene.
