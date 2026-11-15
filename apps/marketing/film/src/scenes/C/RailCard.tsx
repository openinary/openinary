// One rail card (output: square corners unless r_, 1 px hairline, card shadow). Scene D may import this READ-ONLY to
// draw the cards it takes over at f837 (pass its own rect; the video keeps its timeline via videoTimeAt).
import type { ReactNode } from "react";
import { Freeze, OffthreadVideo } from "remotion";
import { Photo } from "../../components/Photo";
import type { Rect } from "../../lib/camera";
import { BLOSSOM_MP4 } from "../../lib/media";
import { C, SHADOW } from "../../lib/tokens";
import { FPS, T } from "../../timeline";
import { CARDS, type RailCardId } from "./railLayout";

/** blossom.mp4 filling its box: frozen on source 2.0 s (so_2) until the resolve, then plays at 1x. */
export const RailVideo = ({ frame, w, h }: { frame: number; w: number; h: number }) => (
  <Freeze frame={Math.max(0, frame - T.S11.resolve)}>
    <OffthreadVideo
      src={BLOSSOM_MP4}
      trimBefore={Math.round(T.S11.videoFrom * FPS)}
      muted
      style={{ position: "absolute", left: 0, top: 0, width: w, height: h, display: "block" }}
    />
  </Freeze>
);

/** Flat white veil over a card (neighbour dimming); nothing at 0. Pass as a RailCard child. */
export const Veil = ({ a }: { a: number }) =>
  a > 0 ? <div style={{ position: "absolute", inset: 0, background: `rgba(${C.wash},${a.toFixed(4)})` }} /> : null;

export const RailCard = ({
  id,
  rect,
  frame,
  opacity = 1,
  shadow = SHADOW.card,
  children,
}: {
  id: RailCardId;
  rect: Rect;
  frame: number;
  opacity?: number;
  shadow?: string;
  /** Overlays inside the card box (clipped to it): badges, processing veil. */
  children?: ReactNode;
}) => {
  const c = CARDS[id];
  if (opacity <= 0) return null;
  const br = c.radius === "max" ? "50%" : c.radius;
  return (
    <div
      style={{
        position: "absolute",
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        borderRadius: br,
        overflow: "hidden",
        boxShadow: shadow,
        background: C.cell,
        opacity: opacity < 1 ? opacity : undefined,
      }}
    >
      {c.video ? <RailVideo frame={frame} w={rect.w} h={rect.h} /> : <Photo media={c.media} w={rect.w} h={rect.h} x={0} y={0} />}
      {children}
      <div style={{ position: "absolute", inset: 0, borderRadius: br, boxShadow: `inset 0 0 0 1px ${C.hairline}` }} />
    </div>
  );
};
