// Camera math (concept A 3.0). A camera is the affine map screen = zoom * world + (tx, ty).
import type { Pt } from "./ease";

export type Camera = { zoom: number; tx: number; ty: number };
export type Rect = { x: number; y: number; w: number; h: number };

export const IDENTITY: Camera = { zoom: 1, tx: 0, ty: 0 };

/** CSS transform (use with transformOrigin "0 0") that keeps world point A at screen point S at zoom z. */
export const anchorZoom = (A: Pt, S: Pt, z: number) =>
  `translate(${S.x}px, ${S.y}px) scale(${z}) translate(${-A.x}px, ${-A.y}px)`;

/** Same camera as a state object (for rulers, hit maths, worldToScreen). */
export const cameraFromAnchor = (A: Pt, S: Pt, z: number): Camera => ({ zoom: z, tx: S.x - z * A.x, ty: S.y - z * A.y });

/** CSS transform for a camera state (transformOrigin "0 0"). */
export const cameraTransform = (c: Camera) => `translate(${c.tx}px, ${c.ty}px) scale(${c.zoom})`;

export const worldToScreen = (c: Camera, p: Pt): Pt => ({ x: c.zoom * p.x + c.tx, y: c.zoom * p.y + c.ty });

export const rectToScreen = (c: Camera, r: Rect): Rect => ({
  x: c.zoom * r.x + c.tx,
  y: c.zoom * r.y + c.ty,
  w: c.zoom * r.w,
  h: c.zoom * r.h,
});

/** Compose: apply `inner` first, then `outer` (e.g. a group zoom inside a scene camera). */
export const compose = (outer: Camera, inner: Camera): Camera => ({
  zoom: outer.zoom * inner.zoom,
  tx: outer.zoom * inner.tx + outer.tx,
  ty: outer.zoom * inner.ty + outer.ty,
});

/** The rulers' map: the camera blended 20% toward identity (fixed points stay fixed). */
export const parallax = (c: Camera, amount = 0.2): Camera => ({
  zoom: 1 + amount * (c.zoom - 1),
  tx: amount * c.tx,
  ty: amount * c.ty,
});
