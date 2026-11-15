// S12 (f837 to f925): the video card rises into G's bbox first (FLY, clear of the lower shards) while its content
// crossfades to the one photo; the rail cards and four new renditions then fly into the lower shards, the photo
// rectangle rounds into the G dome, the red flood grows out of the hub, the group drifts. All geometry from ./geometry.
import { Img } from "remotion";
import type { Rect } from "../../lib/camera";
import { MarkShards } from "../../components/Mark";
import { coverRect } from "../../components/Photo";
import type { Media } from "../../lib/media";
import type { ShardId, ShardState } from "../../lib/shards";
import { C, cardShadow } from "../../lib/tokens";
import { VIDEO } from "../../lib/variants";
import { H, T, W } from "../../timeline";
import {
  FLY_IDS,
  G_NOTCH_PATH,
  STENCIL_MEDIA,
  STENCIL_RECT,
  flightAt,
  floodR,
  gCropAt,
  gCropPath,
  ghostAt,
  landingOf,
  morphAt,
  seatScale,
  shardRect,
  stencilPlacementAt,
  stencilRectAt,
  stencilZ,
  type FlyId,
} from "./geometry";
import { cardRect, neighbourVeil } from "../C/railLayout";
import { RailCard, RailVideo, Veil } from "../C/RailCard";

const S12 = T.S12;

const abs = (r: Rect) => ({ position: "absolute" as const, left: r.x, top: r.y, width: r.w, height: r.h });
const local = (img: Rect, box: Rect): Rect => ({ x: img.x - box.x, y: img.y - box.y, w: img.w, h: img.h });

/** An image inside a clipped box; `img` is the image rect in the same (screen) space as `box`. */
const Window = ({ box, img, media, radius = 0, chrome = 0, pad = false, opacity }: { box: Rect; img: Rect; media: Media; radius?: number; chrome?: number; pad?: boolean; opacity?: number }) => {
  const l = local(img, box);
  return (
    <div
      style={{
        ...abs(box),
        borderRadius: radius,
        overflow: "hidden",
        background: pad && chrome > 0 ? `rgba(255,255,255,${chrome})` : undefined,
        boxShadow: chrome > 0 ? cardShadow(chrome) : undefined,
        opacity,
      }}
    >
      <Img src={media.src} style={{ position: "absolute", left: l.x, top: l.y, width: l.w, height: l.h, maxWidth: "none" }} />
      {chrome > 0 ? <div style={{ position: "absolute", inset: 0, borderRadius: radius, boxShadow: `inset 0 0 0 1px rgba(0,0,0,${0.08 * chrome})` }} /> : null}
    </div>
  );
};

/** V2 from the MORPH start: the playing video (cover in the moving box, never stretched) crossfades to the stencil
 *  photo. On the morph start (p 0) this is pixel-identical to RailCard V2. */
const MorphCard = ({ frame }: { frame: number }) => {
  const m = morphAt(frame)!;
  const box = m.rect;
  const chrome = 1 - m.p;
  const v = coverRect(VIDEO, box);
  const s = local(STENCIL_RECT, box);
  return (
    <div style={{ ...abs(box), overflow: "hidden", boxShadow: cardShadow(chrome), background: C.cell }}>
      {m.stencil < 1 ? (
        <div style={{ position: "absolute", left: v.x, top: v.y, width: v.w, height: v.h }}>
          <RailVideo frame={frame} w={v.w} h={v.h} />
        </div>
      ) : null}
      {m.stencil > 0 ? (
        <Img src={STENCIL_MEDIA.src} style={{ position: "absolute", left: s.x, top: s.y, width: s.w, height: s.h, maxWidth: "none", opacity: m.stencil }} />
      ) : null}
      <div style={{ position: "absolute", inset: 0, boxShadow: `inset 0 0 0 1px rgba(0,0,0,${0.08 * chrome})` }} />
    </div>
  );
};

/** The photo clipped to a screen-space path (full-frame layer, like MarkShards' stencil). */
const PhotoClip = ({ d, opacity }: { d: string; opacity?: number }) => (
  <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, clipPath: `path('${d}')`, opacity }}>
    <Img src={STENCIL_MEDIA.src} style={{ position: "absolute", left: STENCIL_RECT.x, top: STENCIL_RECT.y, width: STENCIL_RECT.w, height: STENCIL_RECT.h, maxWidth: "none" }} />
  </div>
);

/** gCrop: the photo rectangle on G's bbox grows the dome's corners and fades out of the ray notches. p = 1 is G itself. */
const GCrop = ({ frame }: { frame: number }) => {
  const p = gCropAt(frame);
  return (
    <>
      <PhotoClip d={gCropPath(p)} />
      {p < 1 ? <PhotoClip d={G_NOTCH_PATH} opacity={1 - p} /> : null}
    </>
  );
};

const Ghost = ({ id, landing, frame }: { id: FlyId; landing: number; frame: number }) => {
  const opacity = ghostAt(landing, frame);
  if (opacity === null) return null;
  return <Window box={shardRect(id, seatScale(id, frame))} img={STENCIL_RECT} media={STENCIL_MEDIA} opacity={opacity} />;
};

const Flight = ({ id, frame }: { id: FlyId; frame: number }) => {
  const fl = flightAt(id, frame);
  if (!fl) return null;
  return <Window box={fl.rect} img={fl.img} media={fl.media} radius={fl.radius} chrome={fl.chrome} pad={fl.pad} />;
};

export const Stencil = ({ frame }: { frame: number }) => {
  const landed = FLY_IDS.filter((id) => frame >= landingOf(id));
  const gIn = frame >= S12.topShard;
  const shards: Partial<Record<ShardId, ShardState>> = {};
  for (const id of landed) shards[id] = { s: seatScale(id, frame) };
  const only: ShardId[] = gIn ? ["G", ...landed] : landed;
  // the group drift scales everything about R (the flood centre), the flood radius with it
  const z = stencilZ(frame);
  const flood = frame >= S12.flood[0] ? { r: floodR(frame) * z, feather: S12.floodFeather } : undefined;
  return (
    <>
      {frame < S12.flights.F[0] ? (
        <RailCard id="V1" rect={cardRect("V1", frame)} frame={frame}>
          <Veil a={neighbourVeil("V1", frame)} />
        </RailCard>
      ) : null}
      {frame < S12.morph[0] ? (
        <RailCard id="V2" rect={cardRect("V2", frame)} frame={frame} />
      ) : frame < S12.gCrop[0] ? (
        <MorphCard frame={frame} />
      ) : frame < S12.topShard ? (
        <GCrop frame={frame} />
      ) : null}
      {FLY_IDS.map((id) => (
        <Ghost key={id} id={id} landing={landingOf(id)} frame={frame} />
      ))}
      {only.length ? (
        <MarkShards placement={stencilPlacementAt(frame)} only={only} shards={shards} stencil={{ src: STENCIL_MEDIA.src, rect: stencilRectAt(frame) }} flood={flood} />
      ) : null}
      {FLY_IDS.map((id) => (
        <Flight key={id} id={id} frame={frame} />
      ))}
    </>
  );
};

