# Product film

Remotion source of the homepage film (`public/product/film.mp4` and `film-dark.mp4`). Rebuilt on 2026-11-12 from
the September session history (v2), then reworked into v5: the self-hosted dashboard as it is today, the site's
tokens and Mona Sans, a dark cut, a 15-bar retime with a new cache beat, a new score and an end card without
the URL. v6 (2026-11-28) moves it to the product's look with the site: an ink mark, blue selection
annotations, and a soundtrack of UI sounds over a muffled beat.

Own npm package, outside the pnpm workspace and excluded from the site's tsconfig and eslint.

```bash
npm install
npm run assets   # public/media + grain from apps/cloud/web/public/demo (needs Pillow, numpy, ffmpeg)
npm run cues     # public/cues.json from src/timeline.ts (design frames + the time warp)
npm run score    # audio/pack/mix.py: the muffled beat + the UI sound pack on the cues -> public/score.wav
                 # (needs numpy and ffmpeg; FILM_BEAT and FILM_SOUND_PACK point at the inputs, not in the repo)
npm run check    # self-checks, run after cues
npm run studio
npx remotion render Film169 out/Film169.mp4 --crf=14       # light, with the score
npx remotion render Film169Dark out/Film169Dark.mp4 --crf=14
```

Time: 48 fps, 96 BPM, 120 frames a bar, 15 bars (1800 frames, 37.5 s). The choreography is still written in the
v2 frames (`T0` in `src/timeline.ts`); `rt()` maps them onto the film through `KNOTS`: inside a segment a motion
keeps its shape (the slope says how much slower), at a jump new time opens between two events while whatever
spans it (a drift, a creep, a playing video) runs on. Put a jump half a frame after an event, never on one, or the
range that ends there stretches. New material is written in film frames (`CACHE`, `K.K8`). The soundtrack is mixed
for these 15 bars by `audio/pack/mix.py`, which places the UI sounds on the cues exported in `public/cues.json`.

Themes: `applyTheme` in `src/lib/tokens.ts` switches the token objects (`C`, `SHADOW`, `DASH`) before a frame
renders, so read tokens at render time, never at module load.

`docs/storyboard.md` is the original design spec, `docs/16x9.md` the 16:9 framing, `docs/BUILDERS.md` the code
architecture. Scene A (`src/scenes/A`) is measured off the live dashboard at a 1440 px viewport.
