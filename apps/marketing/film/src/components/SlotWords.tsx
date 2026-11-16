// P3 HUD: the slot-word track (timeline SLOT_WORDS). Centred x 960, Mona Sans 400 168 px, -0.04em (the site's H1),
// auto-fit to <= 1600 px; each word may set its own baseline. The hero word K3 is scene B's, not rendered here.
import { useCurrentFrame } from "remotion";
import { compile } from "../lib/type";
import { SLOT, SLOT_WORDS } from "../timeline";
import { Typewriter } from "./Typewriter";

export const SlotWords = () => {
  const frame = useCurrentFrame();
  return (
    <>
      {SLOT_WORDS.map((w) => {
        const c = compile(w);
        const end = c.exit ? c.exit[1] : Infinity;
        if (frame < c.first || frame > end) return null;
        return (
          <Typewriter
            key={w.id}
            script={w}
            frame={frame}
            x={w.x ?? SLOT.x}
            baseline={w.baseline ?? SLOT.baseline}
            size={w.size ?? SLOT.size}
            weight={SLOT.weight}
            trackingEm={SLOT.trackingEm}
            maxWidth={SLOT.maxWidth}
          />
        );
      })}
    </>
  );
};
