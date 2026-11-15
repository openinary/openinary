// "Lab" composition: a live gallery of the shared primitives (foundation QA + usage examples for builders).
// Frame 0: stencil + flood + rulers with camera and selection. Frame 1: lockup, cursors, press, photos.
// Frame 2: hero typewriter mid-typing. Not part of the film.
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Cursor, press } from "./components/Cursor";
import { FrameLine, Ground } from "./components/Ground";
import { MAX_R_DIST, MarkShards, Wordmark } from "./components/Mark";
import { Photo, coverRect } from "./components/Photo";
import { Rulers } from "./components/Rulers";
import { Typewriter } from "./components/Typewriter";
import { cameraFromAnchor } from "./lib/camera";
import { useFontsReady } from "./lib/fonts";
import { MEDIA } from "./lib/media";
import { PLACEMENTS, markBox } from "./lib/shards";
import { outputOf } from "./lib/variants";
import { HERO, K, T } from "./timeline";

const StencilPanel = () => {
  const p = PLACEMENTS.stencil;
  const box = markBox(p);
  // global stencil: hills covering the mark box, centred (concept A S12: rect (410.5, 388, 1099x824))
  const r = coverRect(MEDIA.hills2400, { w: 1099, h: 824 });
  const rect = { x: 410.5 + r.x, y: 388 + r.y, w: r.w, h: r.h };
  return (
    <>
      <MarkShards placement={p} stencil={{ src: MEDIA.hills2400.src, rect }} flood={{ r: 0.55 * MAX_R_DIST * p.k }} />
      <Rulers camera={cameraFromAnchor({ x: 960, y: 800 }, { x: 960, y: 800 }, 1.5)} selection={box} />
    </>
  );
};

const LockupPanel = () => {
  const letters = Array.from({ length: 9 }, (_, j) => (j < 5 ? {} : { opacity: j < 7 ? 1 : 0, dx: j < 7 ? 20 : 40 }));
  const pr = press(T.S13.press, T.S13.press);
  const circle = outputOf("w_600,h_600,r_max");
  const padded = outputOf("w_600,h_600,c_pad,b_white");
  const r40 = outputOf("w_400,h_600,r_40");
  return (
    <>
      <MarkShards placement={PLACEMENTS.lockup} />
      <Wordmark placement={PLACEMENTS.lockup} letters={letters} />
      <Photo media={MEDIA.hills600} w={circle.w / 2} h={circle.h / 2} x={200} y={900} radius="max" />
      <Photo media={MEDIA.hills600} w={padded.w / 2} h={padded.h / 2} x={560} y={900} pad={1} hairline />
      <Photo media={MEDIA.hills600} w={r40.w / 2} h={r40.h / 2} x={920} y={900} radius={20} />
      <Cursor x={1300} y={950} scale={pr.cursor} />
      <Cursor x={1450} y={950} variant="pointer" />
      <Cursor x={1600} y={950} variant="grab" />
      <Cursor x={1750} y={950} variant="grabbing" />
      <Rulers />
    </>
  );
};

export const Lab = () => {
  const ready = useFontsReady();
  const frame = useCurrentFrame();
  if (!ready) return null;
  return (
    <AbsoluteFill>
      <Ground />
      <FrameLine />
      {frame === 0 ? <StencilPanel /> : null}
      {frame === 1 ? <LockupPanel /> : null}
      {frame === 2 ? (
        <>
          <Typewriter script={K.K3} frame={492} x={HERO.x} baseline={HERO.baseline} size={HERO.size} weight={HERO.weight} trackingEm={HERO.trackingEm} />
          <Rulers />
        </>
      ) : null}
    </AbsoluteFill>
  );
};
