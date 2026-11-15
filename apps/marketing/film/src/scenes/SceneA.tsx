// Scene A (f0 to f210, bars 1 to 2): F0 hold + inhale + fling (S1); grab, lift, the dashboard rises with the
// Upload Files dialog open, drag onto the dropzone (S2); drop, FLIP into the file row, upload, dialog closes,
// grid + tree insert (S3); click the tile and push through it to the full-bleed photo (S4).
// ABSOLUTE frames; pure in the frame; every frame number from timeline.ts. Layers, bottom to top:
//   shards (fling) | file chip | [camera] window base (+ file tiles) | hills tile (screen) | [camera] veil + dialog | held card
import { useCurrentFrame } from "remotion";
import { F0Tableau } from "../components/F0Tableau";
import { FileCard, FileChip } from "../components/FileCard";
import { MarkShards } from "../components/Mark";
import { Photo } from "../components/Photo";
import type { CursorState } from "../components/Cursor";
import { cameraTransform, type Camera, type Rect } from "../lib/camera";
import { prog } from "../lib/ease";
import { MEDIA } from "../lib/media";
import { F0_STATE, PLACEMENTS } from "../lib/shards";
import { H, SCENES, T } from "../timeline";
import { HillsTile, WindowBase, WindowOverlay } from "./A/Dashboard";
import { WIN } from "./A/layout";
import { POINTER_IN, cardAt, cardShadow, cursorPos, cursorScale, flingState, riseY, uiOpacity, worldCamera } from "./A/motion";

/** Scene B's first frame: hills-2400 full bleed, 1979 x 1484 centred on (960, 742). */
export const FULL_BLEED = { w: 1979, h: 1484, x: 960 - 1979 / 2, y: 742 - 1484 / 2 } as const;
const FLING_END = T.S1.flingStartOf("G") + T.S1.fling.dur;

export const SceneA = () => {
  const f = useCurrentFrame();
  if (f < SCENES.A.from || f > SCENES.A.to) return null;
  // f0..f44: the seam tableau, untouched (pixel-identical to f1076..f1079).
  if (f < T.S2.grab) return <F0Tableau {...flingState(f)} />;
  if (f >= T.S4.fullBleed) return <Photo media={MEDIA.hills2400} {...FULL_BLEED} />;

  const cam = cameraTransform(worldCamera(f));
  const rise = riseY(f);
  const onScreen = WIN.y + rise < H;
  const ui = uiOpacity(f);
  const card = cardAt(f);
  const chip = 1 - prog(f, T.S2.chipFade);
  return (
    <>
      {f <= FLING_END ? <MarkShards placement={PLACEMENTS.F0} shards={{ ...F0_STATE, ...flingState(f).shards }} /> : null}
      {chip > 0 ? <FileChip opacity={chip} /> : null}
      <div style={{ position: "absolute", inset: 0, transformOrigin: "0 0", transform: cam }}>
        {onScreen && ui > 0 ? <WindowBase f={f} rise={rise} opacity={ui} /> : null}
      </div>
      <HillsTile f={f} />
      <div style={{ position: "absolute", inset: 0, transformOrigin: "0 0", transform: cam }}>{onScreen ? <WindowOverlay f={f} rise={rise} /> : null}</div>
      {card.space === "screen" ? (
        <FileCard cx={card.cx} cy={card.cy} w={card.w} h={card.h} radius={card.radius} scale={card.scale} rotate={card.rot} shadow={cardShadow(card)} />
      ) : null}
    </>
  );
};

/** No selection in scene A (the dropzone hover red is alone in its frames). */
export const selectionAt = (_frame: number): Rect | null => null;

/** The world camera (drift, then the push). At f208 it equals the camera scene B keeps reporting from f208 on
 * (zoom Z_FULL = 5.1897 vs B's 5.19: under 0.2 px at the far ruler end), so the rulers never jump. */
export const cameraAt = (frame: number): Camera | null => (frame < SCENES.A.from || frame > SCENES.A.to ? null : worldCamera(frame));

export const cursorAt = (frame: number): CursorState | null => {
  if (frame < T.S2.cursorIn[0] || frame > SCENES.A.to) return null;
  const opacity = 1 - prog(frame, T.S4.cursorFade);
  if (opacity <= 0) return null;
  const p = cursorPos(frame);
  return { x: p.x, y: p.y, scale: cursorScale(frame), opacity, variant: frame >= POINTER_IN ? "pointer" : "arrow" };
};
