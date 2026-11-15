// Typewriter model (concept A 3.0 + FINAL.md S6 rewrite). Pure functions of the absolute frame.
//  - slot i of a typed run appears at at + round(i * k) (k = 1 f, 1.5 f for the hero word); spaces are slots
//  - newest glyph: opacity 0 -> 1 over 2 f (0.5 on its own frame, 1 the frame after)
//  - colour: #CFCFCF -> #0A0A0A over 12 f after the glyph appears (a word being typed is a grey-to-ink gradient)
//  - delete: the char turns exit grey on its frame and is gone the next frame (1 per k f, from the end)
//  - exit: the whole word -> #E0E0E0 over [a, b] (linear) and unmounts at b + 1
import { interpolateColors } from "remotion";
import { TYPE, type WordScript } from "../timeline";
import { C } from "./tokens";

export type Glyph = { ch: string; tIn: number; tDel: number | null; block: number };
export type Block = { start: number; text: string };
export type Compiled = { glyphs: Glyph[]; blocks: Block[]; first: number; exit: readonly [number, number] | null };

const memo = new WeakMap<WordScript, Compiled>();

export const compile = (script: WordScript): Compiled => {
  const hit = memo.get(script);
  if (hit) return hit;
  const glyphs: Glyph[] = [];
  const live: Glyph[] = [];
  const blocks: Block[] = [];
  let block = 0;
  for (const step of script.steps) {
    const k = step.k ?? 1;
    if ("type" in step) {
      if (blocks.length === 0) blocks.push({ start: step.at, text: "" });
      [...step.type].forEach((ch, i) => {
        const g: Glyph = { ch, tIn: step.at + Math.round(i * k), tDel: null, block };
        glyphs.push(g);
        live.push(g);
      });
    } else {
      for (let j = 0; j < step.del; j++) live[live.length - 1 - j].tDel = step.at + Math.round(j * k);
      live.splice(live.length - step.del, step.del);
      block += 1;
      blocks.push({ start: step.at, text: "" });
    }
    blocks[blocks.length - 1].text = live.map((g) => g.ch).join("");
  }
  const out = { glyphs, blocks, first: glyphs[0]?.tIn ?? 0, exit: script.exit ?? null };
  memo.set(script, out);
  return out;
};

export type GlyphFrame = { ch: string; color: string; opacity: number };

export type TypeColors = { grey: string; ink: string; exit: string };
export const defaultColors = (): TypeColors => ({ grey: C.typeGrey, ink: C.ink, exit: C.exitGrey });

/** Glyphs to render at `frame` (deleted ones removed), or null when the word is not on screen. */
export const glyphsAt = (script: WordScript, frame: number, colors: TypeColors = defaultColors(), rampFrames: number = TYPE.rampFrames) => {
  const c = compile(script);
  if (frame < c.first) return null;
  if (c.exit && frame > c.exit[1]) return null;
  const exitP = c.exit ? Math.min(1, Math.max(0, (frame - c.exit[0]) / (c.exit[1] - c.exit[0]))) : 0;
  const out: GlyphFrame[] = [];
  for (const g of c.glyphs) {
    if (g.tDel !== null && frame > g.tDel) continue;
    if (g.tDel !== null && frame === g.tDel) {
      out.push({ ch: g.ch, color: colors.exit, opacity: 1 });
      continue;
    }
    const opacity = Math.min(1, Math.max(0, (frame - g.tIn + 1) / TYPE.fadeInFrames));
    let color = interpolateColors(Math.min(1, Math.max(0, (frame - g.tIn) / rampFrames)), [0, 1], [colors.grey, colors.ink]);
    if (exitP > 0) color = interpolateColors(exitP, [0, 1], [color, colors.exit]);
    out.push({ ch: g.ch, color, opacity });
  }
  return out;
};

/** Index of the layout block active at `frame`, and the SITE-eased progress of its re-centre. */
export const blockAt = (script: WordScript, frame: number) => {
  const { blocks } = compile(script);
  let i = 0;
  while (i + 1 < blocks.length && frame >= blocks[i + 1].start) i++;
  const p = i === 0 ? 1 : Math.min(1, Math.max(0, (frame - blocks[i].start) / TYPE.recentreFrames));
  return { i, p };
};
