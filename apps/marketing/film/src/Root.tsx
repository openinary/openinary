import { Composition } from "remotion";
import { Film } from "./Film";
import { Lab } from "./Lab";
import "./lib/fonts"; // starts loading the local Geist faces (loadFont holds delayRender until they are added)
import { OUTPUT } from "./lib/framing";
import { FPS, FRAMES, H, W } from "./timeline";

// 1920x1484 matches the 2196x1698 marketing slot aspect (1.2933). 15 bars at 96 BPM, 48 fps = 1800 frames = 37.5 s.
export const Root = () => (
  <>
    <Composition id="Film" component={Film} width={W} height={H} fps={FPS} durationInFrames={FRAMES} />
    {/* the same film reframed for 16:9 (marketing homepage): per-frame framing camera, lib/framing.ts */}
    <Composition
      id="Film169"
      component={Film}
      defaultProps={{ aspect: "16:9" as const }}
      width={OUTPUT["16:9"].w}
      height={OUTPUT["16:9"].h}
      fps={FPS}
      durationInFrames={FRAMES}
    />
    {/* the dark cut, for the site's dark theme */}
    <Composition
      id="Film169Dark"
      component={Film}
      defaultProps={{ aspect: "16:9" as const, theme: "dark" as const }}
      width={OUTPUT["16:9"].w}
      height={OUTPUT["16:9"].h}
      fps={FPS}
      durationInFrames={FRAMES}
    />
    <Composition id="Lab" component={Lab} width={W} height={H} fps={FPS} durationInFrames={3} />
  </>
);
