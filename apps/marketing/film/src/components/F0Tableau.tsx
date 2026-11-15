// Frame 0: the exploded mark around the photo card, and the file chip. The loop seam depends on this file:
// scene A (fling out of F0, f0..f54) and scene D (burst into F0, f1058..f1079) both render <F0Tableau {...state} />
// and state functions return {} (the exact default code path) on the identity frames f0..f7 and f1076..f1079.
import { cardShadow } from "../lib/tokens";
import { E, prog } from "../lib/ease";
import { F0_OFFSET, F0_R, F0_STATE, PLACEMENTS, SHARD_IDS, placeR, type Placement, type ShardId, type ShardState } from "../lib/shards";
import { T } from "../timeline";
import { FileCard, FileChip } from "./FileCard";
import { MarkShards } from "./Mark";

export type TableauState = {
  placement?: Placement;
  /** Full per-shard state (replaces F0_STATE for the shards given). */
  shards?: Partial<Record<ShardId, ShardState>>;
  card?: { scale?: number; opacity?: number; shadowT?: number };
  chip?: { opacity?: number; dy?: number };
};

export const F0Tableau = ({ placement, shards, card, chip }: TableauState) => (
  <>
    <FileCard
      scale={card?.scale}
      opacity={card?.opacity}
      shadow={card?.shadowT === undefined ? undefined : cardShadow(card.shadowT)}
    />
    <FileChip opacity={chip?.opacity} dy={chip?.dy} />
    <MarkShards placement={placement ?? PLACEMENTS.F0} shards={shards ? { ...F0_STATE, ...shards } : F0_STATE} />
  </>
);

/** S1 (f0..f54): static, inhale 12 px (SITE), then the clockwise fling (EXITIN, +1100 px, scale 1.3). */
export const flingState = (frame: number): TableauState => {
  if (frame < T.S1.inhale[0]) return {};
  const inhale = T.S1.inhalePx * prog(frame, T.S1.inhale, E.SITE);
  const f = T.S1.fling;
  const shards: Partial<Record<ShardId, ShardState>> = {};
  for (const id of SHARD_IDS) {
    const p = prog(frame, [T.S1.flingStartOf(id), T.S1.flingStartOf(id) + f.dur], E.EXITIN);
    shards[id] = { d: F0_OFFSET[id] - inhale + f.dist * p, s: 1 + (f.scale - 1) * p };
  }
  return { shards };
};

/**
 * S14 burst (f1058..f1079): k 4 -> 7 anchored at R and offsets 0 -> F0 (BURST); card scale 0.12 -> 1 about R,
 * opacity over its first 6 f, shadow 0 -> card (BURST); chip opacity 0 -> 1, y 6 -> 0 (SITE).
 * Before f1058 it returns the pre-burst state (k 4, R on (960, 720), no card, no chip).
 */
export const burstState = (frame: number): TableauState => {
  const S = T.S14;
  if (frame >= S.static[0]) return {};
  const p = prog(frame, S.burst, E.BURST);
  const shards: Partial<Record<ShardId, ShardState>> = {};
  for (const id of SHARD_IDS) shards[id] = { d: F0_OFFSET[id] * p };
  const cp = prog(frame, S.card, E.BURST);
  const copacity = prog(frame, S.cardOpacity);
  const hp = prog(frame, S.chip, E.SITE);
  return {
    placement: placeR(4 + 3 * p, F0_R),
    shards,
    card: { scale: S.cardScale0 + (1 - S.cardScale0) * cp, opacity: copacity, shadowT: cp },
    chip: { opacity: hp, dy: 6 * (1 - hp) },
  };
};
