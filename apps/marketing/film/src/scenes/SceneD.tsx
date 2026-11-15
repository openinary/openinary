// Scene D (f834 to f1079): S12 stencil + flood, S13 lockup + CTA + click, S14 exit, selection, burst into F0.
// ABSOLUTE frames; the world is drawn from HANDOFF.CD (scene C owns f834..f836). Geometry: src/scenes/D/geometry.ts.
import { useCurrentFrame } from "remotion";
import type { Camera, Rect } from "../lib/camera";
import type { CursorState } from "../components/Cursor";
import { F0Tableau, burstState } from "../components/F0Tableau";
import { HANDOFF, SCENES, T } from "../timeline";
import { Stencil } from "./D/Stencil";
import { EndCard } from "./D/EndCard";
import { cameraAtD, selectionRectAt } from "./D/geometry";

export const SceneD = () => {
  const frame = useCurrentFrame();
  if (frame < HANDOFF.CD || frame > SCENES.D.to) return null;
  if (frame < T.S13.toLockup[0]) return <Stencil frame={frame} />;
  if (frame < T.S14.recentre[1]) return <EndCard frame={frame} />;
  // the recentre has landed on the pre-burst placement: the same F0Tableau code path as frame 0 from here on
  return (
    <>
      <F0Tableau {...burstState(frame)} />
      {frame < T.S14.blink ? <EndCard frame={frame} selectionOnly /> : null}
    </>
  );
};

/** Screen rect of the current selection (ruler extent bands), or null. */
export const selectionAt = (frame: number): Rect | null => selectionRectAt(frame);
/** Scene camera (drives the 20% ruler parallax), or null to let an earlier scene drive. */
export const cameraAt = (frame: number): Camera | null => cameraAtD(frame);
/** Cursor for Film's cursor layer, or null. */
export const cursorAt = (_frame: number): CursorState | null => null; // v5: no click on the end card
