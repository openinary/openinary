// P0: the table. #FAFAFA + a static grain plate (identical on every frame: seam-safe, compresses well).
// The plate is zero-mean luminance noise (sd 1.2 levels) encoded for normal blending over #FAFAFA exactly.
// Ground and FrameLine live in OUTPUT space (the composition size), under any framing.
import { AbsoluteFill, Img, staticFile, useVideoConfig } from "remotion";
import { C } from "../lib/tokens";
import { FRAME_LINE } from "../timeline";

export const Ground = () => (
  <AbsoluteFill style={{ background: C.ground }}>
    <Img src={staticFile(C.grain)} style={{ position: "absolute", left: 0, top: 0, width: 2048, height: 2048, maxWidth: "none" }} />
  </AbsoluteFill>
);

/** Artboard frame line: 1 px inset 72 of the output (x 72..1848, y 72..1412 on the master). Static, under the world. */
export const FrameLine = () => {
  const { width, height } = useVideoConfig();
  const d = FRAME_LINE.x0;
  return (
    <div
      style={{
        position: "absolute",
        left: d,
        top: d,
        width: width - 2 * d,
        height: height - 2 * d,
        boxShadow: `inset 0 0 0 1px ${C.frameLine}`,
      }}
    />
  );
};
