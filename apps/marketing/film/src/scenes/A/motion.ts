// Scene A motion model (f0 to f210). Every value is a pure function of the ABSOLUTE film frame; every frame
// number comes from timeline.ts (T.S1..T.S4, SOUND). Layout lives in layout.ts.
import { press } from "../../components/Cursor";
import type { TableauState } from "../../components/F0Tableau";
import { coverRect } from "../../components/Photo";
import { cameraFromAnchor, worldToScreen, type Camera, type Rect } from "../../lib/camera";
import { E, SPRING, clamp01, lerp, logZoom, prog, quad, springAt, tween, type Pt } from "../../lib/ease";
import { MEDIA } from "../../lib/media";
import { F0_OFFSET, SHARD_IDS, type ShardId, type ShardState } from "../../lib/shards";
import { T } from "../../timeline";
import { DLG, FILE_COLS, FILE_ROW_Y, TILE, TILE_RADIUS, UPLOAD_BTN, WIN, rowThumb } from "./layout";

const { S1, S2, S3, S4 } = T;

// ---------------------------------------------------------------------------------------------------------
// S1 fling (scene A's copy of components/F0Tableau flingState, with an INOUT inhale: it leaves the 12 static
// seam frames at zero speed and hands over to the EXITIN fling at zero speed; f0..f7 still return {}).
// ---------------------------------------------------------------------------------------------------------
export const flingState = (frame: number): TableauState => {
  if (frame < S1.inhale[0]) return {};
  const inhale = S1.inhalePx * prog(frame, S1.inhale, E.INOUT);
  const f = S1.fling;
  const shards: Partial<Record<ShardId, ShardState>> = {};
  for (const id of SHARD_IDS) {
    const p = prog(frame, [S1.flingStartOf(id), S1.flingStartOf(id) + f.dur], E.EXITIN);
    shards[id] = { d: F0_OFFSET[id] - inhale + f.dist * p, s: 1 + (f.scale - 1) * p };
  }
  return { shards };
};

// ---------------------------------------------------------------------------------------------------------
// Window rise and camera
// ---------------------------------------------------------------------------------------------------------
/** Window (and dialog) translateY, +1200 -> 0, RISE. */
export const riseY = (f: number) => tween(f, S2.rise, [S2.riseFrom, 0], E.RISE);

/** Push anchor: the Upload Files dialog centre (960, 900), which stays put on screen while the world zooms. */
const DC: Pt = S2.dialog.centre;
const Z_DRIFT = S2.driftZ[1];
/** The hills image inside the tile at rest: hills-2400 covering the 286 square (381.33 x 286, world). */
export const HILLS_IMG = coverRect(MEDIA.hills2400, { w: TILE, h: TILE });
/** Final zoom: the tile's 4:3 image becomes exactly 1979 px wide (= scene B's full bleed). 5.1897 ~ spec 5.19. */
export const Z_FULL = 1979 / HILLS_IMG.w;
/** Hills tile centre in world = T.S3.tileCentre = T.S4.pushA. */
const A = S4.pushA;
const S0: Pt = { x: DC.x + (A.x - DC.x) * Z_DRIFT, y: DC.y + (A.y - DC.y) * Z_DRIFT }; // A on screen after the push

/**
 * World camera. f105..f160 push 1 -> 1.35 about the dialog centre; f164..f208 dive: A travels from where the push
 * left it to (960, 742) while the zoom goes 1.35 -> Z_FULL in log space (PUSH), so the camera never pulls back.
 */
export const worldCamera = (f: number): Camera => {
  if (f < S4.push[0]) return cameraFromAnchor(DC, DC, tween(f, S2.drift, S2.driftZ, E.DRIFT));
  const p = prog(f, S4.push, E.PUSH);
  return cameraFromAnchor(A, { x: lerp(S0.x, S4.pushS1.x, p), y: lerp(S0.y, S4.pushS1.y, p) }, logZoom(p, Z_DRIFT, Z_FULL));
};

export const toScreen = (c: Camera, r: Rect): Rect => ({
  x: c.zoom * r.x + c.tx,
  y: c.zoom * r.y + c.ty,
  w: c.zoom * r.w,
  h: c.zoom * r.h,
});

// ---------------------------------------------------------------------------------------------------------
// The card: F0 card -> lifted -> dragged onto the dropzone (screen space) -> FLIP onto the file row's icon slot,
// fading into the FileImage icon (dialog space from the drop on, so it rides the dialog and the camera).
// ---------------------------------------------------------------------------------------------------------
export type CardState = {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rot: number;
  scale: number;
  radius: number;
  lift: number;
  opacity: number;
  space: "screen" | "dialog";
};

const liftT = (f: number) => prog(f, S2.lift, E.SITE);
const flipT = (f: number) => springAt(f, S3.flip[0], SPRING.FLIP);

/** Screen-space card while held (f45..f104). */
const heldCard = (f: number): CardState => {
  const l = liftT(f);
  const d = prog(f, S2.drag, E.DRAG);
  return {
    cx: lerp(S2.dragFrom.x, S2.dragTo.x, d),
    cy: lerp(S2.dragFrom.y, S2.dragTo.y, d),
    w: lerp(S2.cardFrom.w, S2.cardTo.w, d),
    h: lerp(S2.cardFrom.h, S2.cardTo.h, d),
    rot: S2.liftRotate * l,
    scale: 1 + (S2.liftScale - 1) * l,
    radius: 14,
    lift: l,
    opacity: 1,
    space: "screen",
  };
};

/** Dialog origin in WORLD px (window rest position + dialog offset; the rise is over by the drop). */
const DLG_WORLD: Pt = { x: WIN.x + DLG.x, y: WIN.y + DLG.y };
const dialogToWorld = (p: Pt): Pt => ({ x: DLG_WORLD.x + p.x, y: DLG_WORLD.y + p.y });

/** The dropped card expressed in dialog-local px at the drop frame (camera inverted), so f104 -> f105 is seamless. */
const DROP_LOCAL = (() => {
  const c = heldCard(S2.drop);
  const cam = worldCamera(S2.drop);
  return {
    ...c,
    cx: (c.cx - cam.tx) / cam.zoom - DLG_WORLD.x,
    cy: (c.cy - cam.ty) / cam.zoom - DLG_WORLD.y,
    w: c.w / cam.zoom,
    h: c.h / cam.zoom,
  };
})();

/** The card lands on the icon slot and hands over to the FileImage icon (it fades out as the icon fades in), once
 * the FLIP is 85% home (f113); the row text follows from f115. */
export const iconIn = (f: number) => prog(f, [S3.rowText - 2, S3.rowText + 2], E.SITE);

export const cardAt = (f: number): CardState => {
  if (f < S2.drop) return heldCard(f);
  const s = flipT(f);
  const t = rowThumb(rowDy(f));
  return {
    cx: lerp(DROP_LOCAL.cx, t.x + t.w / 2, s),
    cy: lerp(DROP_LOCAL.cy, t.y + t.h / 2, s),
    w: lerp(DROP_LOCAL.w, t.w, s),
    h: lerp(DROP_LOCAL.h, t.h, s),
    rot: lerp(DROP_LOCAL.rot, 0, s),
    scale: lerp(DROP_LOCAL.scale, 1, s),
    radius: lerp(14, 4, s),
    lift: Math.max(0, 1 - s),
    opacity: 1 - iconIn(f),
    space: "dialog",
  };
};

/** Card shadow: card (lift 0) -> lifted (lift 1) while held; lifted -> none during the FLIP. */
export const cardShadow = (c: CardState) => {
  if (c.space === "screen") {
    const t = c.lift;
    return `0 1px 2px rgba(0,0,0,${(0.06 * (1 - t)).toFixed(4)}), 0 ${lerp(18, 30, t).toFixed(2)}px ${lerp(40, 60, t).toFixed(2)}px ${lerp(-16, -20, t).toFixed(2)}px rgba(0,0,0,${lerp(0.18, 0.25, t).toFixed(4)})`;
  }
  const t = clamp01(c.lift);
  return t <= 0.001
    ? undefined
    : `0 ${(30 * t).toFixed(2)}px ${(60 * t).toFixed(2)}px ${(-20 * t).toFixed(2)}px rgba(0,0,0,${(0.25 * t).toFixed(4)})`;
};

/** The point of the card under the cursor tip: offset (140, 40) at 480 px width, scaled and rotated with the card. */
const grabPoint = (c: CardState): Pt => {
  const k = (c.w / S2.cardFrom.w) * c.scale;
  const ox = S2.cursorTipOffset.x * k,
    oy = S2.cursorTipOffset.y * k;
  const a = (c.rot * Math.PI) / 180;
  return { x: c.cx + ox * Math.cos(a) - oy * Math.sin(a), y: c.cy + ox * Math.sin(a) + oy * Math.cos(a) };
};

// ---------------------------------------------------------------------------------------------------------
// Dialog internals (UploadSection states: idle, drag active, selected, uploading, uploaded)
// ---------------------------------------------------------------------------------------------------------
/** Dropzone drag-active (blue) amount: hard on at f88, linear off f105..f110. */
export const hoverAt = (f: number) => (f < S2.hover ? 0 : 1 - prog(f, S3.hoverOff));
/** Selection section (header, button, file list): in with the drop (y +10 -> 0), out as the result box comes in. */
export const rowDy = (f: number) => tween(f, S3.rowIn, [10, 0], E.SITE);
export const selectionOpacity = (f: number) =>
  (f < S3.rowIn[0] ? 0 : prog(f, S3.rowIn, E.SITE)) * (1 - prog(f, [S3.uploaded[0], S3.uploaded[0] + 4], E.SITE));
/** The dialog grows (top fixed) from the idle dropzone-only height to the full height as the selection appears. */
export const dialogH = (f: number) => tween(f, S3.rowIn, [DLG.h0, DLG.h], E.SITE);
/** File row text: from f115 (the flying card has passed), 4 f fade, x +8 -> 0 (SITE). */
export const rowTextT = (f: number) => (f < S3.rowText ? 0 : prog(f, [S3.rowText, S3.rowText + 4], E.SITE));
/** Upload Files button: pressed at T.S3.uploadPress, then spinner + Uploading... (disabled, 50%). */
export const uploadPress = (f: number) => press(f, S3.uploadPress, { release: S3.uploadRelease });
export const uploading = (f: number) => f >= S3.progress[0];
/** Result box: in from f130 (y +8 -> 0, SITE), CheckCircle2 pop (BADGE spring 0.6 -> 1). */
export const doneT = (f: number) => (f < S3.uploaded[0] ? 0 : prog(f, [S3.uploaded[0], S3.uploaded[0] + 6], E.SITE));
export const doneScale = (f: number) => springAt(f, S3.uploaded[0], SPRING.BADGE, { from: 0.6, to: 1 });

/** Dialog close: scale 1 -> 0.96, opacity 1 -> 0 (PRESS = ease-in); veil 1 -> 0 linear. */
export const dialogScale = (f: number) => tween(f, S3.dialogClose, [1, 0.96], E.PRESS);
export const dialogOpacity = (f: number) => 1 - prog(f, S3.dialogClose, E.PRESS);
export const veilOpacity = (f: number) => 1 - prog(f, S3.veilOut);

// ---------------------------------------------------------------------------------------------------------
// Grid insert (hills at c1, the others FLIP one slot right, 2 f stagger) and sidebar tree insert
// ---------------------------------------------------------------------------------------------------------
/**
 * Stagger RIGHT to LEFT, once the dialog is gone (f144): product-shoot f144, product-animation f146, portrait f148,
 * then hills.jpg drops into c1 at f150, drawn above every sliding tile (the four c16b ticks, right to left).
 * Slot index: 3 shoot, 2 animation, 1 portrait, 0 hills.
 */
const insertStart = (slotAfter: number) => S3.gridInsert[0] + (3 - slotAfter) * S3.gridStagger;
/** Window-local x of the file tile that ends in slot `slotAfter` (it FLIPs from slot slotAfter - 1). */
export const fileTileX = (f: number, slotAfter: number) =>
  lerp(FILE_COLS[slotAfter - 1], FILE_COLS[slotAfter], springAt(f, insertStart(slotAfter), SPRING.FLIP));
export const hillsTileScale = (f: number) => springAt(f, insertStart(0), SPRING.FLIP, { from: 0.94, to: 1 });
export const hillsTileOpacity = (f: number) => (f < insertStart(0) ? 0 : prog(f, [insertStart(0), insertStart(0) + 8], E.SITE));

// ---------------------------------------------------------------------------------------------------------
// S4: the hills tile (screen space) and the dive
// ---------------------------------------------------------------------------------------------------------
const HILLS_CENTRE: Pt = { x: WIN.x + FILE_COLS[0] + TILE / 2, y: WIN.y + FILE_ROW_Y + TILE / 2 };
export const tilePress = (f: number) => press(f, S4.press, { release: S4.release });
/** Tile mask 286 -> 381.33 (4:3), radius 11.5 -> 0, border -> 0. INOUT, not SITE: SITE front-loads the widening into
 * f172-f180, when the neighbours are still opaque, so the tile ran over the portrait tile; INOUT widens it while
 * they dissolve (overlap starts about f188, neighbours at 29%). */
const maskT = (f: number) => prog(f, S4.tileMask, E.INOUT);

export type TileState = {
  box: Rect; // screen
  img: Rect; // screen
  radius: number; // screen px
  border: number; // screen px
  darken: number;
  zoom: number;
  opacity: number;
};

export const hillsTileAt = (f: number): TileState => {
  const cam = worldCamera(f);
  const k = hillsTileScale(f) * tilePress(f).target;
  const m = maskT(f);
  const bw = lerp(TILE, HILLS_IMG.w, m) * k;
  const bh = TILE * k;
  const box = toScreen(cam, { x: HILLS_CENTRE.x - bw / 2, y: HILLS_CENTRE.y - bh / 2, w: bw, h: bh });
  const img = toScreen(cam, {
    x: HILLS_CENTRE.x - (HILLS_IMG.w * k) / 2,
    y: HILLS_CENTRE.y - (HILLS_IMG.h * k) / 2,
    w: HILLS_IMG.w * k,
    h: HILLS_IMG.h * k,
  });
  return {
    box,
    img,
    radius: lerp(TILE_RADIUS, 0, m) * k * cam.zoom,
    border: lerp(1.5, 0, m) * cam.zoom,
    darken: tilePress(f).darken,
    zoom: cam.zoom * k,
    opacity: hillsTileOpacity(f),
  };
};

/** Everything else in the window dissolves to the ground. */
export const uiOpacity = (f: number) => 1 - prog(f, S4.uiDissolve);

// ---------------------------------------------------------------------------------------------------------
// Cursor
// ---------------------------------------------------------------------------------------------------------
const inRect = (p: Pt, r: Rect) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const tileCentreOnScreen = (f: number): Pt => worldToScreen(worldCamera(f), HILLS_CENTRE);
/** Where the cursor let go of the card (world = screen: the camera is still at rest on the drop frame). */
const DROP_TIP = grabPoint(heldCard(S2.drop));
/** The press point on the Upload Files button (world): right of the label, low, so the hand never hides the label. */
const BTN_TIP: Pt = dialogToWorld({ x: UPLOAD_BTN.x + UPLOAD_BTN.w * 0.88, y: UPLOAD_BTN.y + UPLOAD_BTN.h * 0.78 });
/** Drop -> button: world-anchored (it rides the push), INOUT (a CURSOR-eased 8 f move reads as a jump), arriving as
 * the press starts (P - 4). */
const TO_BTN: readonly [number, number] = [S2.drop, S3.uploadPress - 3];

export const cursorPos = (f: number): Pt => {
  if (f < S2.grab) return quad(prog(f, S2.cursorIn, E.CURSOR), S2.cursorFrom, S2.cursorCtrl, S2.cursorTo);
  if (f < S2.drop) return grabPoint(heldCard(f));
  const t = prog(f, TO_BTN, E.INOUT);
  const onBtn = worldToScreen(worldCamera(f), { x: lerp(DROP_TIP.x, BTN_TIP.x, t), y: lerp(DROP_TIP.y, BTN_TIP.y, t) });
  if (f < S3.cursorToTile[0]) return onBtn;
  // CURSOR ease (the film's cursor-travel curve), not SITE: SITE's 125 px/f first frame reads as a jump.
  const u = prog(f, S3.cursorToTile, E.CURSOR);
  const end = tileCentreOnScreen(Math.min(f, S3.cursorToTile[1]));
  return { x: lerp(onBtn.x, end.x, u), y: lerp(onBtn.y, end.y, u) };
};

/** Upload Files button on screen at frame f (for the pointer switch). */
const btnOnScreen = (f: number) => toScreen(worldCamera(f), { ...dialogToWorld(UPLOAD_BTN), w: UPLOAD_BTN.w, h: UPLOAD_BTN.h });
/** First frame the tip is over the Upload Files button: the cursor is a pointer from here on (the button, then
 * the grid tiles, are cursor-pointer in the product). */
export const POINTER_IN = (() => {
  for (let f = S2.drop; f <= S3.uploadPress; f++) if (inRect(cursorPos(f), btnOnScreen(f))) return f;
  return S3.uploadPress;
})();
/** First frame the tip is over the hills tile (the real grid's hover state starts here). */
export const HOVER_IN = (() => {
  for (let f = S3.cursorToTile[0]; f <= S3.cursorToTile[1]; f++) if (inRect(cursorPos(f), hillsTileAt(f).box)) return f;
  return S3.cursorToTile[1];
})();
/** Tile hover overlay (name gradient + checkbox): 9 f fade in from HOVER_IN, out with the cursor. */
export const tileHover = (f: number) => prog(f, [HOVER_IN, HOVER_IN + 9], E.SITE) * (1 - prog(f, S4.cursorFade));

export const cursorScale = (f: number) =>
  f < S3.cursorToTile[0]
    ? press(f, S2.grab, { release: S2.drop, releaseFrames: S3.release[1] - S3.release[0] }).cursor * uploadPress(f).cursor
    : tilePress(f).cursor;
