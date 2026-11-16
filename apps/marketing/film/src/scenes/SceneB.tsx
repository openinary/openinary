// Scene B (f196 to f630, drawn f204 to f605): full-bleed photo, URL pill + typing (S5), keystroke reactions (S6),
// slot machine (S7), DROP into the wall of variants + hero word (S8), collapse-whip into the rail (S9).
// ABSOLUTE frames; every value is a pure function of the frame (see B/model.ts). Layer order, bottom to top:
// guides | mask [cell + rows | ghosts + photo | selection + badge | hero word | pill/chip] | cell edges.
import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { CursorState } from "../components/Cursor";
import { Typewriter } from "../components/Typewriter";
import type { Camera, Rect } from "../lib/camera";
import { prog } from "../lib/ease";
import { viewportAt, type Viewport } from "../lib/framing";
import { C } from "../lib/tokens";
import { useViewport } from "../lib/viewport";
import { HERO, K, SCENES, T } from "../timeline";
import { Badge, Ghosts, Guides, PhotoFrame, Selection, selectionOpacity } from "./B/Frame";
import { columnOpacity, dropProg, frameScreen, heroShift, maskWidth, rulerCam } from "./B/model";
import { CacheChip, ReloadBlink } from "./B/Cache";
import { Pill } from "./B/Pill";
import { rowOpacity, Wall } from "./B/Wall";

const LAST = T.S9.columnOut[1]; // nothing of B is left after the column fades (f605)
const active = (f: number) => f >= SCENES.B.from && f <= Math.min(SCENES.B.to, LAST);

const badgeOpacity = (f: number) => prog(f, [T.S6.selectionIn[0], T.S6.selectionIn[0] + 4]) * (1 - dropProg(f, T.S8.badgeOut));
const guideOpacity = (f: number) => selectionOpacity(f) * (1 - dropProg(f, T.S8.badgeOut));
/** B1 carries our circle, its selection and its chip. */
const b1 = (f: number) => rowOpacity(f, "B1");
/** Cell mask width: the whole visible width, collapsing from the width visible when the collapse starts. */
const maskW = (f: number, vp: Viewport) => maskWidth(f, vp.visible.w, viewportAt(T.S9.collapse[0], vp.aspect).visible.w);

export const SceneB = () => {
  const f = useCurrentFrame();
  const vp = useViewport();
  if (!active(f)) return null;
  const photo = f >= T.S4.fullBleed;
  const r = frameScreen(f);
  const { y: vy, h: vh } = vp.visible;
  const mw = maskW(f, vp);
  const mx = T.S6.frameCentre.x - mw / 2;
  const edges = f >= T.S9.edges[0];
  return (
    <AbsoluteFill>
      {photo ? <Guides r={r} opacity={guideOpacity(f)} /> : null}
      <div style={{ position: "absolute", left: mx, top: vy, width: mw, height: vh, overflow: "hidden", opacity: columnOpacity(f) }}>
        <div style={{ position: "absolute", left: -mx, top: -vy, width: 1920, height: 1484 }}>
          <Wall f={f} />
          <div style={{ position: "absolute", inset: 0, opacity: b1(f) }}>
            {photo ? <Ghosts f={f} /> : null}
            {photo ? <PhotoFrame f={f} /> : null}
            {photo ? <Selection r={r} f={f} opacity={selectionOpacity(f)} /> : null}
            {photo ? <Badge r={r} f={f} opacity={badgeOpacity(f)} /> : null}
            <ReloadBlink f={f} />
            <ReloadBlink f={f} />
          </div>
          {f >= K.K3.steps[0].at ? (
            <Typewriter
              script={K.K3}
              x={HERO.x - heroShift(f)}
              baseline={HERO.baseline}
              size={HERO.size}
              weight={HERO.weight}
              trackingEm={HERO.trackingEm}
            />
          ) : null}
          <div style={{ position: "absolute", inset: 0, opacity: f >= T.S8.drop ? b1(f) : 1 }}>
            <Pill f={f} />
            <CacheChip f={f} />
          </div>
        </div>
      </div>
      {edges ? <CellEdges x0={mx} x1={mx + mw} opacity={columnOpacity(f)} vp={vp} /> : null}
    </AbsoluteFill>
  );
};

/** Collapse edges: 2 px full-height guides + 20 px idle handles where they cross the frame line. */
const CellEdges = ({ x0, x1, opacity, vp }: { x0: number; x1: number; opacity: number; vp: Viewport }) => (
  <div style={{ position: "absolute", left: 0, top: 0, opacity }}>
    {[x0, x1].map((x, i) => (
      <div key={i}>
        <div style={{ position: "absolute", left: x - 1, top: vp.visible.y, width: 2, height: vp.visible.h, background: C.guide }} />
        {[vp.frameLine.y, vp.frameLine.y + vp.frameLine.h].map((y) => (
          <div
            key={y}
            style={{ position: "absolute", left: x - 10, top: y - 10, width: 20, height: 20, borderRadius: 4, background: C.white, boxShadow: `inset 0 0 0 2px ${C.handleIdleStroke}` }}
          />
        ))}
      </div>
    ))}
  </div>
);

/** Screen rect of the current selection (ruler extent bands), or null. */
export const selectionAt = (f: number, vp: Viewport = viewportAt(f)): Rect | null => {
  if (!active(f) || f < T.S6.selectionIn[0] || b1(f) <= 0) return null;
  const r = frameScreen(f);
  if (f < T.S9.collapse[0]) return r;
  const mw = maskW(f, vp);
  const x0 = Math.max(r.x, T.S6.frameCentre.x - mw / 2);
  const x1 = Math.min(r.x + r.w, T.S6.frameCentre.x + mw / 2);
  return x1 > x0 ? { x: x0, y: r.y, w: x1 - x0, h: r.h } : null;
};
/** Ruler camera: continues A's push camera at f208, renormalises during the slam, then B's camera (+ whip pan). */
export const cameraAt = (f: number): Camera | null => (active(f) && f >= T.S4.fullBleed ? rulerCam(f) : null);
/** No cursor in scene B. */
export const cursorAt = (_f: number): CursorState | null => null;
