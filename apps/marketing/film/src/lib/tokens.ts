// Visual tokens (v6: the marketing site's tokens, which are the product's, apps/marketing/styles/index.css: ink mark, blue accent). Import from here, never hard-code a hex twice.

export const C = {
  ground: "#F7F7F5",
  rulerBand: "rgba(241,241,238,0.92)", // #F1F1EE at 92%
  rulerCorner: "#EFEFEC",
  rulerTick: "#DEDEDA",
  rulerNumber: "#8E8E88",
  rulerEdge: "#E7E7E4",
  frameLine: "#E7E7E4",
  cell: "#EFEFEC",
  guide: "#E8E8E4",
  handleIdleStroke: "#DEDEDA",
  accent: "#1C4BB0", // selection annotations (rulers, outline, handles, size badge): the product's one hue
  accentBand: "rgba(28,75,176,0.10)",
  accentTint: "rgba(28,75,176,0.04)",
  ink: "#151515",
  typeGrey: "#DEDEDA",
  exitGrey: "#E7E7E4",
  muted: "#6B6B66",
  host: "#8E8E88",
  faint: "#8E8E88",
  border: "#E7E7E4",
  dashed: "#DEDEDA",
  hairline: "rgba(0,0,0,0.08)",
  windowBorder: "#E4E4E3",
  sidebar: "#F7F7F5",
  activeNav: "#EFEFEC",
  groupLabel: "#8E8E88",
  success: "#15803D",
  white: "#FFFFFF", // image padding, text on photos, badge text: white in both themes
  surface: "#FFFFFF", // pills, chips, cards
  wash: "255,255,255", // rgb of the veils that fade neighbours out
  grain: "grain.png",
};

/** Dark cut: the marketing site's .dark tokens (styles/index.css). */
const DARK: Partial<typeof C> = {
  ground: "#181818",
  rulerBand: "rgba(29,29,29,0.92)",
  rulerCorner: "#1F1F1F",
  rulerTick: "#3B3B3B",
  rulerNumber: "#8A8A8A",
  rulerEdge: "#2A2A2A",
  frameLine: "#2A2A2A",
  cell: "#1F1F1F",
  guide: "#2A2A2A",
  handleIdleStroke: "#454545",
  accent: "#3B7BFF",
  accentBand: "rgba(59,123,255,0.16)",
  accentTint: "rgba(59,123,255,0.06)",
  ink: "#EEEEEE",
  typeGrey: "#454545",
  exitGrey: "#323232",
  muted: "#A4A4A4",
  host: "#8A8A8A",
  faint: "#8A8A8A",
  border: "#2E2E2E",
  dashed: "#3B3B3B",
  hairline: "rgba(255,255,255,0.08)",
  windowBorder: "#2A2A2A",
  sidebar: "#0F0F0F",
  activeNav: "#242424",
  groupLabel: "#8A8A8A",
  success: "#4ADE80",
  surface: "#232323",
  wash: "24,24,24",
  grain: "grain-dark.png",
};

export const SHADOW: Record<string, string> = {
  card: "0 1px 2px rgba(0,0,0,.06), 0 18px 40px -16px rgba(0,0,0,.18)",
  lifted: "0 30px 60px -20px rgba(0,0,0,.25)",
  window: "0 1px 0 rgba(0,0,0,.04), 0 24px 60px -20px rgba(0,0,0,.12)",
  pill: "0 1px 2px rgba(0,0,0,.05), 0 16px 40px -16px rgba(0,0,0,.12)",
  dialog: "0 24px 64px -16px rgba(0,0,0,.25)",
};
const DARK_SHADOW: Partial<typeof SHADOW> = {
  card: "0 0 0 1px rgba(255,255,255,.06), 0 18px 40px -16px rgba(0,0,0,.6)",
  pill: "inset 0 1px 0 rgba(255,255,255,.06), 0 16px 40px -16px rgba(0,0,0,.6)",
  window: "0 0 0 1px rgba(255,255,255,.05), 0 24px 60px -20px rgba(0,0,0,.6)",
};

/** The self-hosted dashboard (scene A), as packages/dashboard renders it: light and dark measured off the live DOM. */
export const DASH: Record<string, string> = {
  page: "#F3F3F1",
  panel: "#FFFFFF",
  ring: "#E7E7E4",
  ink: "#151515",
  nav: "#3F3F3C",
  icon: "#6B6B66",
  faint: "#8E8E88",
  dash: "#DEDEDA",
  well: "#F7F7F5",
  track: "#F1F1EF",
  seg: "#EAEAE7",
  segOn: "#FFFFFF",
  blue: "#1F5FE0",
  primary: "#1C4BB0",
  primaryRing: "rgba(59,123,255,0.6)",
  green: "#15803D",
  veil: "21,21,21,0.28",
  cardRing: "rgba(0,0,0,0.08)",
  active: "#FFFFFF",
  activeShadow: "0 0 0 1px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.06)",
  dialog: "#FFFFFF",
  dialogShadow: "0 0 0 1px rgba(0,0,0,0.08), 0 2px 4px -1px rgba(0,0,0,0.06), 0 24px 64px -12px rgba(0,0,0,0.12)",
  drop: "rgba(243,243,241,0.3)",
  control: "#FFFFFF",
  avatar: "#E4E4E0",
};
const DARK_DASH: Partial<typeof DASH> = {
  page: "#0F0F0F",
  panel: "#181818",
  ring: "#1E1E1E",
  ink: "#EEEEEE",
  nav: "#C4C4C4",
  icon: "#A4A4A4",
  faint: "#8A8A8A",
  dash: "#2A2A2A",
  well: "#0F0F0F",
  track: "#2A2A2A",
  seg: "#0F0F0F",
  segOn: "#242424",
  blue: "#60A5FA",
  primary: "#3B7BFF",
  primaryRing: "rgba(143,179,255,0.5)",
  green: "#4ADE80",
  veil: "0,0,0,0.6",
  cardRing: "rgba(238,238,238,0.06)",
  active: "#242424",
  activeShadow: "0 1px 2px rgba(0,0,0,0.5), 0 4px 8px -2px rgba(0,0,0,0.35)",
  dialog: "#171717",
  dialogShadow: "inset 0 1px 0 rgba(255,255,255,0.07), 0 0 0 1px rgba(0,0,0,0.5), 0 24px 64px -12px rgba(0,0,0,0.55)",
  drop: "rgba(42,42,42,0.3)",
  control: "#0F0F0F",
  avatar: "#2B2B2B",
};

export type Theme = "light" | "dark";
const LIGHT = { C: { ...C }, SHADOW: { ...SHADOW }, DASH: { ...DASH } };
/**
 * Switch every token object in place. Film calls it before rendering a frame, so a render tab (which renders one
 * composition) and the Studio (which re-renders on switch) always see the composition's theme. Anything that
 * caches a token must read it at render time, never at module load.
 */
export const applyTheme = (t: Theme) => {
  Object.assign(C, LIGHT.C, t === "dark" ? DARK : {});
  Object.assign(SHADOW, LIGHT.SHADOW, t === "dark" ? DARK_SHADOW : {});
  Object.assign(DASH, LIGHT.DASH, t === "dark" ? DARK_DASH : {});
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Card shadow scaled by t (0 = none, 1 = card). Two layers, same structure at every t. */
export const cardShadow = (t: number) =>
  `0 1px 2px rgba(0,0,0,${(0.06 * t).toFixed(4)}), 0 18px 40px -16px rgba(0,0,0,${(0.18 * t).toFixed(4)})`;

/** Card (t=0) to lifted (t=1), continuous. */
export const liftShadow = (t: number) =>
  `0 1px 2px rgba(0,0,0,${(0.06 * (1 - t)).toFixed(4)}), 0 ${lerp(18, 30, t).toFixed(2)}px ${lerp(40, 60, t).toFixed(2)}px ${lerp(-16, -20, t).toFixed(2)}px rgba(0,0,0,${lerp(0.18, 0.25, t).toFixed(4)})`;

export const FONT = {
  sans: "Mona Sans",
  mono: "Geist Mono",
} as const;

/** Tabular figures for anything that rolls (counters, badges, odometers). */
export const TNUM = { fontFeatureSettings: '"tnum"' } as const;
