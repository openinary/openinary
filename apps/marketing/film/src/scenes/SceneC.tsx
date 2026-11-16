// SCENE C (f588 to f836 drawn; D takes the cards over at HANDOFF.CD = f837). Bars 6 to 7: the rail.
// S10: the rail LANDs out of the whip on V1 = w_1500,f_webp (WEBP badge, label chip, plain labels), the size meter
//      rolls 2.81 MB -> 85.53 KB, the param flips f_webp -> f_avif (odometer) and the counter rolls on to 60.17 KB.
// S11: the rail pans to V2 = blossom.mp4: honest Processing state (dimmed, spinning Loader2 chip), resolves on f780
//      into the playing trim (source 2.0 s, 1x), meta chip, trim handles snapping to 0:02 / 0:06.
// Geometry lives in C/railLayout.ts (scene D imports it). Every value is a pure function of the absolute frame.
import { useCurrentFrame } from "remotion";
import type { CursorState } from "../components/Cursor";
import type { Camera, Rect } from "../lib/camera";
import { E, prog, springAt, SPRING, tween } from "../lib/ease";
import { Loader2 } from "../lib/icons";
import { BYTES, formatBytes, PILL_FILE, SOURCE, VIDEO } from "../lib/variants";
import { C, FONT, SHADOW } from "../lib/tokens";
import { useViewport } from "../lib/viewport";
import { HANDOFF, K, SCENES, T } from "../timeline";
import { RailCard, Veil } from "./C/RailCard";
import { CARDS, CARD_IDS, cardRect, cardX, centreness, neighbourVeil, railCamera, railOffset, TRIM, v0Opacity, v1Format, videoTimeAt, type RailCardId } from "./C/railLayout";
import { Chip, CHIP, CHIP_BASELINE, chipCharCentre, Line, MONO_ADV, numParts, Odo, PlainLabel, RollChars, spreadLabels, textWidth } from "./C/ui";

const W1 = CARDS.V1.worldX - CARDS.V1.w / 2; // 560: left edge of the V1 column (world)
const R1 = W1 + CARDS.V1.w; // 1360
const W2 = CARDS.V2.worldX - CARDS.V2.w / 2; // 1460

// S10 layout (world px). Row 1: chip + counter share the chip baseline. Row 2: plain labels + output size.
// Track. Row 4: the original (grey). All text >= 30 px, bottom row well inside the frame line (1412).
const L1 = {
  chipTop: 1128,
  counterSize: 44,
  row2Baseline: 1227,
  trackTop: 1258,
  trackH: 10,
  row4Baseline: 1315, // the original (before) line: Geist Mono 400 32 #737373 (4.5:1 on the ground)
  beforeSize: 32,
  smallSize: 30,
} as const;
// S11 layout (FINAL: chip top 1060; the trim bar moves under the plain labels, which FINAL added in S5).
const L2 = { chipTop: 1060, tickBaseline: 1228, trackTop: 1254, trackH: 10, handle: { w: 6, h: 28, r: 3 } } as const;

const BADGE = { inset: 20, h: 44, r: 10, font: 26, padX: 14, baseline: 31 } as const;
const PLAYHEAD = { h: L2.trackH + 16, head: 12 } as const;

/** Bytes shown by the counter at `frame` (S10 count1 then count2, INOUT). */
const bytesAt = (f: number) =>
  f < T.S10.count2[0]
    ? tween(f, T.S10.count1, [BYTES.original, BYTES.w1500webp], E.INOUT)
    : tween(f, T.S10.count2, [BYTES.w1500webp, BYTES.w1500avif], E.INOUT);

/** Badge inside a card, top-left inset 20: white 92%, h 44, r 10, Geist Mono 500 26 ink. */
const Badge = ({ text, opacity = 1, scale = 1 }: { text: string; opacity?: number; scale?: number }) => {
  if (opacity <= 0) return null;
  const w = text.length * MONO_ADV * BADGE.font + 2 * BADGE.padX;
  return (
    <div
      style={{
        position: "absolute",
        left: BADGE.inset,
        top: BADGE.inset,
        width: w,
        height: BADGE.h,
        borderRadius: BADGE.r,
        background: "rgba(255,255,255,0.92)",
        boxShadow: `0 0 0 1px ${C.hairline}`,
        opacity,
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin: "0 0",
      }}
    >
      <svg width={w} height={BADGE.h} style={{ position: "absolute", left: 0, top: 0 }}>
        <text x={BADGE.padX} y={BADGE.baseline} fill={C.ink} style={{ fontFamily: FONT.mono, fontWeight: 500, fontSize: BADGE.font, whiteSpace: "pre" }} xmlSpace="preserve">
          {text}
        </text>
      </svg>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------------------------
// S10: V1 UI (label chip, labels, size meter)
const V1Ui = ({ frame }: { frame: number }) => {
  const vis = centreness(cardX("V1", frame));
  if (vis <= 0) return null;
  const { params } = v1Format(frame);
  const chipBottom = L1.chipTop + CHIP.h;
  const baseline = L1.chipTop + CHIP_BASELINE;
  const [wx, fx] = spreadLabels([
    { text: "width", want: W1 + chipCharCentre(0, 6) },
    { text: "format", want: W1 + chipCharCentre(7, 13) },
  ]);
  // meter: fades up with the counter row, then everything rides the rail
  const mp = prog(frame, T.S10.meterIn, E.SITE);
  const mo = mp * vis;
  const my = 10 * (1 - mp);
  const bytes = bytesAt(frame);
  const mb = bytes >= 1048576;
  const val = mb ? bytes / 1048576 : bytes / 1024;
  const fill = (bytes / BYTES.original) * CARDS.V1.w;
  const small = { size: L1.beforeSize, weight: 400, fill: C.muted } as const;
  const before = `${SOURCE.name} · ${SOURCE.w} × ${SOURCE.h}`;
  const orig = formatBytes(SOURCE.bytes);
  const dims = "1500 × 1125";
  return (
    <>
      {/* same grammar as the video chip: params, then the file in host grey */}
      <Chip left={W1} top={L1.chipTop} segs={[{ text: params, fill: C.ink }, { text: PILL_FILE, fill: C.host }]} opacity={vis}>
        <RollChars
          from={"w_1500,f_webp"}
          to={params}
          frame={frame}
          start={T.S10.flip[0]}
          dur={T.S10.flip[1] - T.S10.flip[0] - 3}
          stagger={1}
          x={CHIP.padX}
          baseline={CHIP_BASELINE}
          size={CHIP.font}
          fill={C.ink}
        />
        <text x={CHIP.padX + params.length * MONO_ADV * CHIP.font} y={CHIP_BASELINE} fill={C.host} xmlSpace="preserve">
          {PILL_FILE}
        </text>
      </Chip>
      <PlainLabel text="width" cx={wx} tickX={W1 + chipCharCentre(0, 6)} chipBottom={chipBottom} frame={frame} start={T.S10.meterIn[0] + 2} opacity={vis} />
      <PlainLabel text="format" cx={fx} tickX={W1 + chipCharCentre(7, 13)} chipBottom={chipBottom} frame={frame} start={T.S10.meterIn[0] + 4} opacity={vis} />
      {mo > 0 ? (
        <div style={{ position: "absolute", left: 0, top: 0, opacity: mo, transform: my ? `translateY(${my}px)` : undefined }}>
          <Odo
            right={R1}
            baseline={baseline}
            size={L1.counterSize}
            parts={[...numParts(val, 2), { text: mb ? " MB" : " KB" }]}
          />
          <Line x={R1 - textWidth(dims, { size: L1.smallSize })} baseline={L1.row2Baseline} width={textWidth(dims, { size: L1.smallSize })} size={L1.smallSize} weight={500} fill={C.ink}>
            {dims}
          </Line>
          <div style={{ position: "absolute", left: W1, top: L1.trackTop, width: CARDS.V1.w, height: L1.trackH, borderRadius: L1.trackH / 2, background: C.border }} />
          <div style={{ position: "absolute", left: W1, top: L1.trackTop, width: fill, height: L1.trackH, borderRadius: L1.trackH / 2, background: C.ink }} />
          <Line x={W1} baseline={L1.row4Baseline} width={textWidth(before, small)} {...small}>
            {before}
          </Line>
          <Line x={R1 - textWidth(orig, small)} baseline={L1.row4Baseline} width={textWidth(orig, small)} {...small}>
            {orig}
          </Line>
        </div>
      ) : null}
    </>
  );
};

// ---------------------------------------------------------------------------------------------------------------
// S11: V2 UI (processing chip, meta chip live inside the card; label chip, labels, trim bar under it)
const ProcessingChip = ({ frame }: { frame: number }) => {
  const [a] = T.S11.processing;
  if (frame < a || frame > T.S11.chipOut[1]) return null;
  const pop = springAt(frame, a, SPRING.BADGE, { from: 0.8, to: 1 });
  const out = prog(frame, T.S11.chipOut, E.SITE);
  const scale = pop * (1 - 0.2 * out);
  const opacity = Math.min(1, (frame - a + 1) / 3) * (1 - out);
  if (opacity <= 0) return null;
  const size = 26;
  const label = "Processing";
  const tw = textWidth(label, { size, weight: 500, mono: false });
  const padL = 18;
  const padR = 22;
  const gap = 12;
  const w = padL + size + gap + tw + padR;
  const h = 56;
  const rot = ((frame - a) * 360) / T.S11.spinPeriod;
  return (
    <div
      style={{
        position: "absolute",
        left: (CARDS.V2.w - w) / 2,
        top: (CARDS.V2.h - h) / 2,
        width: w,
        height: h,
        borderRadius: h / 2,
        background: C.surface,
        boxShadow: SHADOW.pill,
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: "50% 50%",
      }}
    >
      <div style={{ position: "absolute", left: padL, top: (h - size) / 2, width: size, height: size, transform: `rotate(${rot}deg)` }}>
        <Loader2 size={size} color={C.ink} strokeWidth={2.25} absoluteStrokeWidth style={{ display: "block" }} />
      </div>
      <Line x={padL + size + gap} baseline={h / 2 + 9} width={tw} size={size} weight={500} mono={false} fill={C.ink}>
        {label}
      </Line>
    </div>
  );
};

const V2Inside = ({ frame }: { frame: number }) => {
  const veil = frame < T.S11.resolve ? 0.45 : 0.45 * (1 - prog(frame, T.S11.overlayOut, E.SITE));
  const mp = prog(frame, [T.S11.metaPop, T.S11.metaPop + 8], E.SITE);
  const exit = prog(frame, K.K6.exit);
  return (
    <>
      {veil > 0 ? <div style={{ position: "absolute", inset: 0, background: `rgba(${C.wash},${veil.toFixed(4)})` }} /> : null}
      <ProcessingChip frame={frame} />
      {mp > 0 ? <Badge text={VIDEO.meta} opacity={Math.min(1, mp * 1.6) * (1 - exit)} scale={0.9 + 0.1 * mp} /> : null}
    </>
  );
};

const V2Ui = ({ frame }: { frame: number }) => {
  const exit = prog(frame, K.K6.exit);
  const vis = centreness(cardX("V2", frame)) * (1 - exit);
  if (vis <= 0) return null;
  const sink = 12 * E.SITE(exit);
  const params = CARDS.V2.params;
  const chipBottom = L2.chipTop + CHIP.h;
  const [sx, ex] = spreadLabels([
    { text: "start 2s", want: W2 + chipCharCentre(0, 4) },
    { text: "end 6s", want: W2 + chipCharCentre(5, 9) },
  ]);
  // trim handles: left snaps first (clack T.S11.trimClacks[0]), right second; SNAP hits 2 f after its start
  const [c1, c2] = T.S11.trimClacks;
  const lp = prog(frame, [c1 - 2, T.S11.trim[1] - 4], E.SNAP);
  const rp = prog(frame, [c2 - 2, T.S11.trim[1]], E.SNAP);
  const tw = CARDS.V2.w;
  const lx = W2 + tw * TRIM.from * lp;
  const rx = W2 + tw * (1 - (1 - TRIM.to) * rp);
  const secs = (x: number) => ((x - W2) / tw) * VIDEO.duration;
  const tick = { size: 30, weight: 400, fill: C.muted } as const;
  const tickW = 4 * MONO_ADV * tick.size;
  const h = L2.handle;
  const trackMid = L2.trackTop + L2.trackH / 2;
  const ph = prog(frame, [T.S11.labelsIn, T.S11.labelsIn + 4]);
  const px = W2 + (tw * videoTimeAt(frame)) / VIDEO.duration;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, opacity: vis, transform: sink ? `translateY(${sink}px)` : undefined }}>
      <Chip left={W2} top={L2.chipTop} segs={[{ text: params, fill: C.ink }, { text: `/${VIDEO.name}`, fill: C.host }]} />
      <PlainLabel text="start 2s" cx={sx} tickX={W2 + chipCharCentre(0, 4)} chipBottom={chipBottom} frame={frame} start={T.S11.labelsIn} />
      <PlainLabel text="end 6s" cx={ex} tickX={W2 + chipCharCentre(5, 9)} chipBottom={chipBottom} frame={frame} start={T.S11.labelsIn + 2} />
      {/* track = the 14 s source; the kept segment is ink */}
      <div style={{ position: "absolute", left: W2, top: L2.trackTop, width: tw, height: L2.trackH, borderRadius: L2.trackH / 2, background: C.border }} />
      <div style={{ position: "absolute", left: lx, top: L2.trackTop, width: rx - lx, height: L2.trackH, background: C.ink }} />
      {[lx, rx].map((x, i) => (
        <div
          key={i}
          style={{ position: "absolute", left: x - h.w / 2, top: trackMid - h.h / 2, width: h.w, height: h.h, borderRadius: h.r, background: C.ink, boxShadow: "0 0 0 2px #FFFFFF" }}
        />
      ))}
      {/* playhead: the trimmed clip's real playback position (source time, 1x from so_2 on the resolve) */}
      {ph > 0 ? (
        <>
          {/* the handles' 2 px white ring, so the playhead reads where it crosses the ink segment */}
          <div style={{ position: "absolute", left: px - 1.5, top: trackMid - PLAYHEAD.h / 2, width: 3, height: PLAYHEAD.h, background: C.ink, boxShadow: "0 0 0 2px #FFFFFF", opacity: ph }} />
          <div
            style={{
              position: "absolute",
              left: px - PLAYHEAD.head / 2,
              top: trackMid - PLAYHEAD.h / 2 - PLAYHEAD.head / 2,
              width: PLAYHEAD.head,
              height: PLAYHEAD.head,
              borderRadius: "50%",
              background: C.ink,
              boxShadow: "0 0 0 2px #FFFFFF",
              opacity: ph,
            }}
          />
        </>
      ) : null}
      {[lx, rx].map((x, i) => (
        <Odo
          key={`t${i}`}
          left={x - tickW / 2}
          baseline={L2.tickBaseline}
          size={tick.size}
          weight={tick.weight}
          fill={tick.fill}
          parts={[{ text: "0:" }, ...numParts(secs(x), 0, 2)]}
        />
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------------------------------------------
/** Card culling against the output frame (design coords), 80 px margin. */
const visible = (r: Rect, v: Rect) => r.x + r.w > v.x - 80 && r.x < v.x + v.w + 80;

export const SceneC = () => {
  const frame = useCurrentFrame();
  const v = useViewport().visible;
  if (frame < SCENES.C.from || frame > SCENES.C.to || frame >= HANDOFF.CD) return null;
  const o = Math.round(railOffset(frame)); // same snap as cardRect (card edges are whole numbers in world px)
  // no clip box: the output frame clips (a 1920x1484 box would cut the rail short of the wider 16:9 edges)
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {CARD_IDS.map((id: RailCardId) => {
        const r = cardRect(id, frame);
        if (!visible(r, v) || frame < T.S10.land[0]) return null; // parked on LAND_FROM before the land: off the master frame, a still strip in the wider 16:9 view
        return (
          <RailCard key={id} id={id} rect={r} frame={frame} opacity={id === "V0" ? v0Opacity(frame) : 1}>
            {id === "V1" ? <Badge text={v1Format(frame).badge} /> : null}
            {id === "V2" ? <V2Inside frame={frame} /> : null}
            <Veil a={neighbourVeil(id, frame)} />
          </RailCard>
        );
      })}
      <div style={{ position: "absolute", left: 0, top: 0, transform: `translateX(${o}px)` }}>
        <V1Ui frame={frame} />
        <V2Ui frame={frame} />
      </div>
    </div>
  );
};

/** No selection in the rail (one red system per frame: the rail frames stay neutral). */
export const selectionAt = (_frame: number): Rect | null => null;
/** The rail pan is the camera pan (20% ruler parallax); B's nominal wall camera blends in from the whip peak. */
export const cameraAt = (frame: number): Camera | null => railCamera(frame);
/** No cursor in bars 6 and 7. */
export const cursorAt = (_frame: number): CursorState | null => null;
