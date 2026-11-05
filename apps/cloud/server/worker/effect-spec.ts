/**
 * Parsing and validation of `e_` effect values, with no image library
 * imported, so the URL parser can decide whether a segment is a
 * transformation without loading sharp. Applying effects lives in
 * effects.ts.
 *
 * apps/cloud/server/worker/effect-spec.ts is a verbatim copy (the Worker
 * cannot import @openinary/core, see transform-cache.ts there); its tests
 * assert both accept and reject the same values. Change both together.
 */

/** One `e_` value split into its name and its colon-separated arguments. */
export interface ParsedEffect {
  name: EffectName;
  args: string[];
}

export type EffectName = keyof typeof EFFECT_ARG_PATTERNS;

const INT = (min: number, max: number) => ({ min, max });

/**
 * Accepted arguments per effect. Patterns only check the shape; numeric
 * ranges are checked by parseEffect so that an out-of-range value is a
 * non-transform segment (and so a 404), exactly like every other key.
 */
const EFFECT_ARG_PATTERNS = {
  fill_light: /^(?::-?\d{1,3}(?::-?\d{1,3})?)?$/,
  blur: /^(?::\d{1,4})?$/,
  sharpen: /^(?::\d{1,4})?$/,
  unsharp_mask: /^(?::\d{1,4})?$/,
  grayscale: /^$/,
  sepia: /^(?::\d{1,3})?$/,
  negate: /^$/,
  brightness: /^(?::-?\d{1,3})?$/,
  // Legacy "contrast:50" and current "contrast:level_50[;type_linear]".
  contrast: /^(?::-?\d{1,3}|:level_-?\d{1,3}(?:;type_(?:sigmoidal|linear))?)?$/,
  saturation: /^(?::-?\d{1,3})?$/,
  hue: /^(?::-?\d{1,3})?$/,
  gamma: /^(?::-?\d{1,3})?$/,
  pixelate: /^(?::\d{1,3})?$/,
  trim: /^(?::\d{1,3}(?::(?:rgb:)?[0-9a-fA-F]{3,8}|:[a-z]+)?)?$/,
  // tint[:equalize][:amount][:color[:position]]... up to 10 colors.
  tint: /^(?::equalize)?(?::\d{1,3})?(?::(?:[0-9a-fA-F]{3,8}|[a-z]+)(?::\d{1,3}p)?){0,10}$/,
  colorize: /^(?::\d{1,3})?$/,
} as const;

/** Inclusive numeric range of each positional argument, by effect. */
const EFFECT_ARG_RANGES: Partial<Record<EffectName, { min: number; max: number }[]>> = {
  fill_light: [INT(0, 100), INT(-100, 100)],
  blur: [INT(1, 2000)],
  sharpen: [INT(1, 2000)],
  unsharp_mask: [INT(1, 2000)],
  sepia: [INT(1, 100)],
  brightness: [INT(-99, 100)],
  contrast: [],
  saturation: [INT(-100, 100)],
  hue: [INT(-100, 100)],
  gamma: [INT(-50, 150)],
  pixelate: [INT(1, 200)],
  trim: [INT(0, 100)],
  colorize: [INT(0, 100)],
};

/** Default of each positional argument, by effect (Cloudinary's defaults). */
const EFFECT_DEFAULTS: Partial<Record<EffectName, number[]>> = {
  fill_light: [100, 0],
  blur: [100],
  sharpen: [100],
  unsharp_mask: [100],
  sepia: [80],
  brightness: [80],
  contrast: [0],
  saturation: [80],
  hue: [80],
  gamma: [0],
  trim: [10],
  colorize: [100],
};

/**
 * CSS named colors (hex without "#"), accepted wherever Cloudinary takes a
 * color name: co_, e_tint, e_trim, b_ and bo_.
 */
export const NAMED_COLORS: Readonly<Record<string, string>> = {
  aliceblue: "f0f8ff", antiquewhite: "faebd7", aqua: "00ffff",
  aquamarine: "7fffd4", azure: "f0ffff", beige: "f5f5dc", bisque: "ffe4c4",
  black: "000000", blanchedalmond: "ffebcd", blue: "0000ff",
  blueviolet: "8a2be2", brown: "a52a2a", burlywood: "deb887",
  cadetblue: "5f9ea0", chartreuse: "7fff00", chocolate: "d2691e",
  coral: "ff7f50", cornflowerblue: "6495ed", cornsilk: "fff8dc",
  crimson: "dc143c", cyan: "00ffff", darkblue: "00008b", darkcyan: "008b8b",
  darkgoldenrod: "b8860b", darkgray: "a9a9a9", darkgreen: "006400",
  darkgrey: "a9a9a9", darkkhaki: "bdb76b", darkmagenta: "8b008b",
  darkolivegreen: "556b2f", darkorange: "ff8c00", darkorchid: "9932cc",
  darkred: "8b0000", darksalmon: "e9967a", darkseagreen: "8fbc8f",
  darkslateblue: "483d8b", darkslategray: "2f4f4f", darkslategrey: "2f4f4f",
  darkturquoise: "00ced1", darkviolet: "9400d3", deeppink: "ff1493",
  deepskyblue: "00bfff", dimgray: "696969", dimgrey: "696969",
  dodgerblue: "1e90ff", firebrick: "b22222", floralwhite: "fffaf0",
  forestgreen: "228b22", fuchsia: "ff00ff", gainsboro: "dcdcdc",
  ghostwhite: "f8f8ff", gold: "ffd700", goldenrod: "daa520", gray: "808080",
  green: "008000", greenyellow: "adff2f", grey: "808080", honeydew: "f0fff0",
  hotpink: "ff69b4", indianred: "cd5c5c", indigo: "4b0082", ivory: "fffff0",
  khaki: "f0e68c", lavender: "e6e6fa", lavenderblush: "fff0f5",
  lawngreen: "7cfc00", lemonchiffon: "fffacd", lightblue: "add8e6",
  lightcoral: "f08080", lightcyan: "e0ffff", lightgoldenrodyellow: "fafad2",
  lightgray: "d3d3d3", lightgreen: "90ee90", lightgrey: "d3d3d3",
  lightpink: "ffb6c1", lightsalmon: "ffa07a", lightseagreen: "20b2aa",
  lightskyblue: "87cefa", lightslategray: "778899", lightslategrey: "778899",
  lightsteelblue: "b0c4de", lightyellow: "ffffe0", lime: "00ff00",
  limegreen: "32cd32", linen: "faf0e6", magenta: "ff00ff", maroon: "800000",
  mediumaquamarine: "66cdaa", mediumblue: "0000cd", mediumorchid: "ba55d3",
  mediumpurple: "9370db", mediumseagreen: "3cb371", mediumslateblue: "7b68ee",
  mediumspringgreen: "00fa9a", mediumturquoise: "48d1cc",
  mediumvioletred: "c71585", midnightblue: "191970", mintcream: "f5fffa",
  mistyrose: "ffe4e1", moccasin: "ffe4b5", navajowhite: "ffdead",
  navy: "000080", oldlace: "fdf5e6", olive: "808000", olivedrab: "6b8e23",
  orange: "ffa500", orangered: "ff4500", orchid: "da70d6",
  palegoldenrod: "eee8aa", palegreen: "98fb98", paleturquoise: "afeeee",
  palevioletred: "db7093", papayawhip: "ffefd5", peachpuff: "ffdab9",
  peru: "cd853f", pink: "ffc0cb", plum: "dda0dd", powderblue: "b0e0e6",
  purple: "800080", rebeccapurple: "663399", red: "ff0000",
  rosybrown: "bc8f8f", royalblue: "4169e1", saddlebrown: "8b4513",
  salmon: "fa8072", sandybrown: "f4a460", seagreen: "2e8b57",
  seashell: "fff5ee", sienna: "a0522d", silver: "c0c0c0", skyblue: "87ceeb",
  slateblue: "6a5acd", slategray: "708090", slategrey: "708090",
  snow: "fffafa", springgreen: "00ff7f", steelblue: "4682b4", tan: "d2b48c",
  teal: "008080", thistle: "d8bfd8", tomato: "ff6347", turquoise: "40e0d0",
  violet: "ee82ee", wheat: "f5deb3", white: "ffffff", whitesmoke: "f5f5f5",
  yellow: "ffff00", yellowgreen: "9acd32",
};

/** "red" | "rgb:f00" | "f00" | "#ff0000" -> "#rrggbb[aa]", or undefined. */
export const parseColor = (value: string): string | undefined => {
  const lower = value.toLowerCase();
  if (NAMED_COLORS[lower]) return `#${NAMED_COLORS[lower]}`;
  const hex = lower.replace(/^rgb:/, "").replace(/^#/, "");
  if (!/^([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(hex)) return undefined;
  return `#${hex}`;
};

/**
 * Parse an `e_` value ("blur:300", "fill_light:70:20", "tint:40:blue") into
 * its name and arguments, or undefined when it is not a supported, in-range
 * effect. The longest name wins, so "unsharp_mask" is never read as a
 * hypothetical "unsharp" with arguments.
 */
export const parseEffect = (value: string): ParsedEffect | undefined => {
  const names = Object.keys(EFFECT_ARG_PATTERNS).sort((a, b) => b.length - a.length);
  const name = names.find((n) => value === n || value.startsWith(`${n}:`)) as
    | EffectName
    | undefined;
  if (!name) return undefined;
  const rest = value.substring(name.length);
  if (!EFFECT_ARG_PATTERNS[name].test(rest)) return undefined;
  const args = rest ? rest.substring(1).split(":") : [];
  // "rgb:ff0000" arrives split in two; put it back together.
  const merged: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "rgb" && i + 1 < args.length) {
      merged.push(`rgb:${args[++i]}`);
    } else {
      merged.push(args[i]);
    }
  }
  const ranges = EFFECT_ARG_RANGES[name] ?? [];
  for (let i = 0; i < ranges.length && i < merged.length; i++) {
    const n = Number(merged[i]);
    if (!Number.isInteger(n) || n < ranges[i].min || n > ranges[i].max) return undefined;
  }
  if (name === "trim" && merged[1] && !parseColor(merged[1])) return undefined;
  if (name === "contrast" && merged[0] && !parseContrast(merged[0])) return undefined;
  if (name === "tint" && !parseTint(merged)) return undefined;
  return { name, args: merged };
};

/**
 * e_contrast's level: "50" (legacy, sigmoidal), "level_50" (sigmoidal,
 * -100..100) or "level_150;type_linear" (linear, 1..200 percent).
 */
export const parseContrast = (
  arg: string,
): { level: number; type: "sigmoidal" | "linear" } | undefined => {
  const match = /^(?:level_)?(-?\d+)(?:;type_(sigmoidal|linear))?$/.exec(arg);
  if (!match) return undefined;
  const level = Number(match[1]);
  const type = (match[2] as "sigmoidal" | "linear" | undefined) ?? "sigmoidal";
  if (type === "linear" ? level < 1 || level > 200 : level < -100 || level > 100) {
    return undefined;
  }
  return { level, type };
};

export interface TintSpec {
  equalize: boolean;
  amount: number;
  stops: { color: string; position: number }[];
}

/**
 * e_tint's arguments: [equalize][:amount][:color[:Np]]..., amount 0-100
 * (default 60; integers only, a "." would end the segment on Cloud's Worker), colors default to red, positions default to an even spread
 * (a single color sits at 50p, as in Cloudinary).
 */
export const parseTint = (args: string[]): TintSpec | undefined => {
  let i = 0;
  const equalize = args[i] === "equalize";
  if (equalize) i++;
  let amount = 60;
  if (args[i] !== undefined && /^\d+$/.test(args[i])) {
    amount = Number(args[i++]);
    if (amount > 100) return undefined;
  }
  const colors: { color: string; position?: number }[] = [];
  for (; i < args.length; i++) {
    const position = /^(\d{1,3})p$/.exec(args[i]);
    if (position) {
      const last = colors[colors.length - 1];
      const value = Number(position[1]);
      if (!last || last.position !== undefined || value > 100) return undefined;
      last.position = value;
      continue;
    }
    const color = parseColor(args[i]);
    if (!color) return undefined;
    colors.push({ color });
  }
  if (colors.length === 0) colors.push({ color: "#ff0000" });
  const stops = colors.map((c, index) => ({
    color: c.color,
    position:
      c.position ??
      (colors.length === 1 ? 50 : Math.round((index / (colors.length - 1)) * 100)),
  }));
  stops.sort((a, b) => a.position - b.position);
  return { equalize, amount, stops };
};

export const numericArg = (effect: ParsedEffect, index: number): number => {
  const raw = effect.args[index];
  if (raw !== undefined && raw !== "") return Number(raw);
  return EFFECT_DEFAULTS[effect.name]?.[index] ?? 0;
};
