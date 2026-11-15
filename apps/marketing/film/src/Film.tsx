// The film: layer stack P0..P5. Scenes use ABSOLUTE frames and return null outside their window.
//  P0 Ground + grain, frame line | P2 world scenes A, B, C, D (later on top) | P1 Rulers HUD (camera + selection
//  from the latest-starting active scene that returns non-null) | P3 slot words | P4 cursor | audio.
// aspect "16:9" (Film169): the world, slot words and cursor render in the 1920x1484 design space inside a stage
// transformed by the per-frame framing (lib/framing.ts); Ground, FrameLine and Rulers stay in output space.
import { Audio } from "@remotion/media";
import type { ReactNode } from "react";
import { AbsoluteFill, staticFile, useCurrentFrame } from "remotion";
import { Cursor, type CursorState } from "./components/Cursor";
import { FrameLine, Ground } from "./components/Ground";
import { Rulers } from "./components/Rulers";
import { SlotWords } from "./components/SlotWords";
import { cameraTransform, compose, IDENTITY, rectToScreen, type Camera, type Rect } from "./lib/camera";
import { useFontsReady } from "./lib/fonts";
import { framingCamera, viewportAt, type Aspect, type Viewport } from "./lib/framing";
import { applyTheme, type Theme } from "./lib/tokens";
import { ViewportProvider } from "./lib/viewport";
import * as A from "./scenes/SceneA";
import * as B from "./scenes/SceneB";
import * as Cc from "./scenes/SceneC";
import * as D from "./scenes/SceneD";
import { AUDIO_READY, H, SCENES, W } from "./timeline";

type SceneModule = {
  selectionAt: (f: number, vp: Viewport) => Rect | null;
  cameraAt: (f: number) => Camera | null;
  cursorAt: (f: number) => CursorState | null;
};
const HUD: readonly (SceneModule & { range: { from: number; to: number } })[] = [
  { ...D, range: SCENES.D },
  { ...Cc, range: SCENES.C },
  { ...B, range: SCENES.B },
  { ...A, range: SCENES.A },
]; // latest start first

/** First non-null answer among the scenes active at `frame`, latest-starting scene first. */
export const hudAt = <K extends keyof SceneModule>(key: K, frame: number, vp: Viewport = viewportAt(frame)): ReturnType<SceneModule[K]> | null => {
  for (const s of HUD) {
    if (frame < s.range.from || frame > s.range.to) continue;
    const v = s[key](frame, vp);
    if (v) return v as ReturnType<SceneModule[K]>;
  }
  return null;
};

export const Film = ({ aspect = "film", theme = "light" }: { aspect?: Aspect; theme?: Theme }) => {
  applyTheme(theme); // before anything below reads a token
  return (
    <>
      <FilmAt aspect={aspect} />
      {AUDIO_READY ? <Audio src={staticFile("score.wav")} /> : null}
    </>
  );
};

const FilmAt = ({ aspect }: { aspect: Aspect }) => {
  const ready = useFontsReady();
  const frame = useCurrentFrame();
  if (!ready) return null;
  const vp = viewportAt(frame, aspect);
  const fc = framingCamera(vp);
  const camera = hudAt("cameraAt", frame, vp) ?? IDENTITY;
  const selection = hudAt("selectionAt", frame, vp);
  const cursor = hudAt("cursorAt", frame, vp);
  // the master renders exactly as before (no stage element); 16:9 wraps the design-space layers in the framing
  const stage = (children: ReactNode) =>
    aspect === "film" ? (
      children
    ) : (
      <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, transformOrigin: "0 0", transform: cameraTransform(fc) }}>{children}</div>
    );
  return (
    <ViewportProvider value={vp}>
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <Ground />
        <FrameLine />
        {stage(
          <AbsoluteFill>
            <A.SceneA />
            <B.SceneB />
            <Cc.SceneC />
            <D.SceneD />
          </AbsoluteFill>,
        )}
        <Rulers camera={compose(fc, camera)} selection={selection ? rectToScreen(fc, selection) : null} />
        {stage(
          <>
            <SlotWords />
            {cursor ? <Cursor {...cursor} /> : null}
          </>,
        )}
      </AbsoluteFill>
    </ViewportProvider>
  );
};
