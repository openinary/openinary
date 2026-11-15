// S8/S9 wall of variants: #F0F0F0 cell revealed radially from the circle, 4 rows of real outputs (3 seamless repeats
// each, centred on the anchor), ripple-in by screen distance, marquee with decaying speed, whip, rows fade top first.
import { Img } from "remotion";
import { coverRect, containRect } from "../../components/Photo";
import { cameraTransform, type Camera } from "../../lib/camera";
import { E, prog } from "../../lib/ease";
import { MEDIA } from "../../lib/media";
import { C, FONT } from "../../lib/tokens";
import { outputOf, WALL, WALL_ANCHOR } from "../../lib/variants";
import { useViewport } from "../../lib/viewport";
import { T } from "../../timeline";
import { CHIP } from "./Pill";
import { dropProg, frameCam, rowCam, worldCam } from "./model";

const GAP = 120; // world px between tiles
const REPEATS = 3;
type RowId = keyof typeof WALL;
/** Row centres in B-world y (concept A S8); tiles are bottom-aligned at centre + 300. */
export const ROWS: readonly { id: RowId; y: number; dir: 1 | -1 }[] = [
  { id: "A1", y: -1571, dir: 1 },
  { id: "A2", y: -811, dir: -1 },
  { id: "B1", y: 760, dir: 1 },
  { id: "B2", y: 1520, dir: -1 },
];

export type Tile = { key: string; row: RowId; params: string; x: number; y: number; w: number; h: number; radius: number | "max"; pad: boolean; anchor: boolean };

/** World layout: every row repeated 3 times; B1's middle repeat puts our circle on x 960, others centre on 960. */
export const TILES: Tile[] = ROWS.flatMap(({ id, y }) => {
  const seq = WALL[id].map((p) => outputOf(p));
  const span = seq.reduce((s, o) => s + o.w + GAP, 0);
  let x0: number;
  if (id === WALL_ANCHOR.row) {
    const before = seq.slice(0, WALL_ANCHOR.index).reduce((s, o) => s + o.w + GAP, 0);
    x0 = T.S6.frameCentre.x - seq[WALL_ANCHOR.index].w / 2 - before - span;
  } else x0 = T.S6.frameCentre.x - (span - GAP) / 2 - span;
  const out: Tile[] = [];
  for (let r = 0; r < REPEATS; r++) {
    let x = x0 + r * span;
    seq.forEach((o, i) => {
      const anchor = id === WALL_ANCHOR.row && r === 1 && i === WALL_ANCHOR.index;
      out.push({ key: `${id}-${r}-${i}`, row: id, params: o.params, x, y: y + 300 - o.h, w: o.w, h: o.h, radius: o.radius, pad: o.pad, anchor });
      x += o.w + GAP;
    });
  }
  return out;
});

const dirOf = (row: RowId) => ROWS.find((r) => r.id === row)!.dir;
const centreOn = (cam: Camera, t: Tile) => ({ x: cam.zoom * (t.x + t.w / 2) + cam.tx, y: cam.zoom * (t.y + t.h / 2) + cam.ty });

/** Circle centre on screen. */
export const circleScreen = (f: number) => {
  const c = frameCam(f);
  return { x: c.zoom * T.S6.frameCentre.x + c.tx, y: c.zoom * T.S6.frameCentre.y + c.ty };
};

/** Ripple start frame of each tile: f481 + round(screen distance to the circle at f492 / 180 px), capped at f492. */
const REF = T.S8.cellReveal[1];
const START: Record<string, number> = Object.fromEntries(
  TILES.map((t) => {
    const p = centreOn(rowCam(REF, dirOf(t.row)), t);
    const o = circleScreen(REF);
    const d = Math.hypot(p.x - o.x, p.y - o.y);
    return [t.key, Math.min(REF, T.S8.tilesIn[0] + Math.round(d / 180))];
  }),
);
export const rowOpacity = (f: number, row: RowId) => 1 - prog(f, T.S9.rowsOut[row]);

const radiusCss = (r: number | "max") => (r === "max" ? "50%" : r);

const TileView = ({ t, f, z }: { t: Tile; f: number; z: number }) => {
  const p = dropProg(f, [START[t.key], START[t.key] + 6], E.SITE);
  if (p <= 0) return null;
  const box = { w: t.w, h: t.h };
  const r = t.pad ? containRect(MEDIA.hills1000, box) : coverRect(MEDIA.hills1000, box);
  const chipW = t.params.length * CHIP.font * 0.6 + 2 * CHIP.padX;
  const px = 1 / z; // one screen pixel in world units
  return (
    <div
      style={{
        position: "absolute",
        left: t.x,
        top: t.y,
        width: t.w,
        height: t.h,
        opacity: p,
        transformOrigin: "50% 50%",
        transform: p < 1 ? `scale(${0.92 + 0.08 * p})` : undefined,
      }}
    >
      <div style={{ position: "absolute", inset: 0, borderRadius: radiusCss(t.radius), overflow: "hidden", background: t.pad ? C.white : undefined }}>
        <Img src={MEDIA.hills1000.src} style={{ position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h, maxWidth: "none", display: "block" }} />
        <div style={{ position: "absolute", inset: 0, borderRadius: radiusCss(t.radius), boxShadow: `inset 0 0 0 ${px}px ${C.hairline}` }} />
      </div>
      <div
        style={{
          position: "absolute",
          left: t.w / 2 - chipW / 2,
          top: t.h + CHIP.gapBelowTile,
          width: chipW,
          height: CHIP.h,
          borderRadius: CHIP.radius,
          background: C.surface,
          boxShadow: `inset 0 0 0 ${px}px ${C.border}`,
          fontFamily: FONT.mono,
          fontWeight: 500,
          fontSize: CHIP.font,
          lineHeight: `${CHIP.h}px`,
          textAlign: "center",
          color: C.ink,
          whiteSpace: "pre",
        }}
      >
        {t.params}
      </div>
    </div>
  );
};

/** Cell + rows (everything but our circle, which SceneB draws). */
export const Wall = ({ f }: { f: number }) => {
  const v = useViewport().visible;
  if (f < T.S8.drop) return null;
  const o = circleScreen(f);
  const rr = 2200 * dropProg(f, T.S8.cellReveal, E.REVEAL);
  const clip = f + 1 < T.S8.cellReveal[1] ? `circle(${rr.toFixed(2)}px at ${o.x.toFixed(2)}px ${o.y.toFixed(2)}px)` : undefined;
  const z = worldCam(f).zoom;
  return (
    <div style={{ position: "absolute", inset: 0, clipPath: clip }}>
      {/* the cell: #F0F0F0 over the ground, as a 4% ink veil so the static grain stays continuous */}
      <div style={{ position: "absolute", left: v.x, top: v.y, width: v.w, height: v.h, background: "rgba(0,0,0,0.04)" }} />
      {ROWS.map((row) => {
        const op = rowOpacity(f, row.id);
        if (op <= 0) return null;
        const cam = rowCam(f, row.dir);
        const vis = TILES.filter((t) => {
          if (t.row !== row.id || t.anchor) return false;
          const x0 = cam.zoom * t.x + cam.tx;
          const x1 = cam.zoom * (t.x + Math.max(t.w, t.params.length * CHIP.font * 0.6 + 2 * CHIP.padX)) + cam.tx;
          const y0 = cam.zoom * t.y + cam.ty;
          const y1 = cam.zoom * (t.y + t.h + CHIP.gapBelowTile + CHIP.h) + cam.ty;
          return x1 > v.x - 200 && x0 < v.x + v.w + 200 && y1 > v.y && y0 < v.y + v.h;
        });
        return (
          <div key={row.id} style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: cameraTransform(cam), opacity: op }}>
            {vis.map((t) => (
              <TileView key={t.key} t={t} f={f} z={z} />
            ))}
          </div>
        );
      })}
    </div>
  );
};
