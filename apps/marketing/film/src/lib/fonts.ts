// Local fonts only (never Google at render time). loadFont() holds its own delayRender until the face is added.
// Film additionally renders nothing until FONTS_READY resolves, so every canvas measurement sees Mona Sans.
import { loadFont } from "@remotion/fonts";
import { useEffect, useState } from "react";
import { continueRender, delayRender, staticFile } from "remotion";
import { FONT } from "./tokens";

export const FONTS_READY: Promise<void> = Promise.all([
  // the exact file the marketing site serves (next/font Google Mona Sans, latin subset, variable 200..900;
  // its default instance is 200, so always set a weight)
  loadFont({ family: FONT.sans, url: staticFile("fonts/MonaSans-latin.woff2"), weight: "200 900" }),
  loadFont({ family: FONT.mono, url: staticFile("fonts/GeistMonoVariableVF.ttf"), weight: "100 900" }),
]).then(() => undefined);

let ctx: CanvasRenderingContext2D | null = null;
const cache = new Map<string, number>();

/**
 * Advance width of `text` in px, kerning on, letter-spacing `trackingEm` (em), WITHOUT the trailing
 * letter-spacing after the last glyph (so centring on it is optically exact).
 * Only call after FONTS_READY (Film guarantees this for everything it renders).
 */
export const measureText = (text: string, opts: { size: number; weight?: number; family?: string; trackingEm?: number }) => {
  const { size, weight = 400, family = FONT.sans, trackingEm = 0 } = opts;
  const key = `${family}|${weight}|${size}|${trackingEm}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (!ctx) ctx = document.createElement("canvas").getContext("2d")!;
  ctx.font = `${weight} ${size}px "${family}"`;
  ctx.fontKerning = "normal";
  const ls = trackingEm * size;
  ctx.letterSpacing = `${ls}px`;
  const w = ctx.measureText(text).width;
  // Chrome's canvas adds letter-spacing after every glyph, like CSS. Detect instead of assuming.
  const withLs = ctx.measureText("x").width;
  ctx.letterSpacing = "0px";
  const trailing = withLs - ctx.measureText("x").width;
  const out = text.length ? w - trailing : 0;
  cache.set(key, out);
  return out;
};

/** Holds the frame until the fonts are in and children re-rendered with correct measurements. Render nothing until true. */
export const useFontsReady = () => {
  const [handle] = useState(() => delayRender("local fonts + text measurement"));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    FONTS_READY.then(() => setReady(true));
  }, []);
  useEffect(() => {
    if (ready) continueRender(handle);
  }, [ready, handle]);
  return ready;
};
