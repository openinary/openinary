/**
 * Theme presets for the playground canvas.
 *
 * Only the tokens the file uploader actually reads are listed, so the "Copy
 * CSS" output is the shortest block that reproduces what is on screen rather
 * than a full shadcn theme dump. Values come from the tweakcn presets of the
 * same name.
 */

export type ThemeTokens = {
  background: string;
  foreground: string;
  card: string;
  "card-foreground": string;
  primary: string;
  "primary-foreground": string;
  muted: string;
  "muted-foreground": string;
  accent: string;
  "accent-foreground": string;
  destructive: string;
  border: string;
  input: string;
  ring: string;
  radius: string;
};

export type Theme = {
  id: string;
  label: string;
  light: ThemeTokens;
  dark: ThemeTokens;
};

export const themes: Theme[] = [
  {
    id: "default",
    label: "Default",
    light: {
      background: "oklch(1 0 0)",
      foreground: "oklch(0.145 0 0)",
      card: "oklch(1 0 0)",
      "card-foreground": "oklch(0.145 0 0)",
      primary: "#27272a",
      "primary-foreground": "oklch(0.985 0 0)",
      muted: "oklch(0.97 0 0)",
      "muted-foreground": "oklch(0.556 0 0)",
      accent: "oklch(0.97 0 0)",
      "accent-foreground": "oklch(0.205 0 0)",
      destructive: "oklch(0.58 0.22 27)",
      border: "oklch(0.922 0 0)",
      input: "oklch(0.922 0 0)",
      ring: "oklch(0.708 0 0)",
      radius: "0.625rem",
    },
    dark: {
      background: "oklch(0.145 0 0)",
      foreground: "oklch(0.985 0 0)",
      card: "oklch(0.205 0 0)",
      "card-foreground": "oklch(0.985 0 0)",
      primary: "#e4e4e7",
      "primary-foreground": "oklch(0.21 0.006 285.885)",
      muted: "oklch(0.274 0.006 286.033)",
      "muted-foreground": "oklch(0.708 0 0)",
      accent: "oklch(0.371 0 0)",
      "accent-foreground": "oklch(0.985 0 0)",
      destructive: "oklch(0.704 0.191 22.216)",
      border: "oklch(1 0 0 / 10%)",
      input: "oklch(1 0 0 / 15%)",
      ring: "oklch(0.556 0 0)",
      radius: "0.625rem",
    },
  },
  {
    id: "vercel",
    label: "Vercel",
    light: {
      background: "oklch(0.99 0 0)",
      foreground: "oklch(0 0 0)",
      card: "oklch(1 0 0)",
      "card-foreground": "oklch(0 0 0)",
      primary: "#000000",
      "primary-foreground": "oklch(1 0 0)",
      muted: "oklch(0.97 0 0)",
      "muted-foreground": "oklch(0.44 0 0)",
      accent: "oklch(0.94 0 0)",
      "accent-foreground": "oklch(0 0 0)",
      destructive: "oklch(0.63 0.19 23.03)",
      border: "oklch(0.92 0 0)",
      input: "oklch(0.94 0 0)",
      ring: "oklch(0 0 0)",
      radius: "0.5rem",
    },
    dark: {
      background: "oklch(0 0 0)",
      foreground: "oklch(1 0 0)",
      card: "oklch(0.14 0 0)",
      "card-foreground": "oklch(1 0 0)",
      primary: "#ffffff",
      "primary-foreground": "oklch(0 0 0)",
      muted: "oklch(0.23 0 0)",
      "muted-foreground": "oklch(0.72 0 0)",
      accent: "oklch(0.32 0 0)",
      "accent-foreground": "oklch(1 0 0)",
      destructive: "oklch(0.69 0.2 23.91)",
      border: "oklch(0.26 0 0)",
      input: "oklch(0.32 0 0)",
      ring: "oklch(0.72 0 0)",
      radius: "0.5rem",
    },
  },
  {
    id: "supabase",
    label: "Supabase",
    light: {
      background: "#fcfcfc",
      foreground: "#171717",
      card: "#fcfcfc",
      "card-foreground": "#171717",
      primary: "#72e3ad",
      "primary-foreground": "#1e2723",
      muted: "#ededed",
      "muted-foreground": "#606060",
      accent: "#ededed",
      "accent-foreground": "#202020",
      destructive: "#ca3214",
      border: "#dfdfdf",
      input: "#dfdfdf",
      ring: "#72e3ad",
      radius: "0.5rem",
    },
    dark: {
      background: "#121212",
      foreground: "#e2e8f0",
      card: "#171717",
      "card-foreground": "#e2e8f0",
      primary: "#006239",
      "primary-foreground": "#dde8e3",
      muted: "#1f1f1f",
      "muted-foreground": "#a2a2a2",
      accent: "#313131",
      "accent-foreground": "#fafafa",
      destructive: "#e5484d",
      border: "#292929",
      input: "#292929",
      ring: "#4ade80",
      radius: "0.5rem",
    },
  },
  {
    id: "claude",
    label: "Claude",
    light: {
      background: "#faf9f5",
      foreground: "#3d3929",
      card: "#faf9f5",
      "card-foreground": "#141413",
      primary: "#c96442",
      "primary-foreground": "#ffffff",
      muted: "#ede9de",
      "muted-foreground": "#83827d",
      accent: "#e9e6dc",
      "accent-foreground": "#28261b",
      destructive: "#b91c1c",
      border: "#dad9d4",
      input: "#dad9d4",
      ring: "#c96442",
      radius: "0.5rem",
    },
    dark: {
      background: "#262624",
      foreground: "#c3c0b6",
      card: "#30302e",
      "card-foreground": "#faf9f5",
      primary: "#d97757",
      "primary-foreground": "#ffffff",
      muted: "#1b1b19",
      "muted-foreground": "#b7b5a9",
      accent: "#1a1915",
      "accent-foreground": "#f5f4ee",
      destructive: "#ef4444",
      border: "#3e3e38",
      input: "#52514a",
      ring: "#d97757",
      radius: "0.5rem",
    },
  },
  {
    id: "modern-minimal",
    label: "Modern Minimal",
    light: {
      background: "#ffffff",
      foreground: "#333333",
      card: "#ffffff",
      "card-foreground": "#333333",
      primary: "#3b82f6",
      "primary-foreground": "#ffffff",
      muted: "#f9fafb",
      "muted-foreground": "#6b7280",
      accent: "#e0f2fe",
      "accent-foreground": "#1e3a8a",
      destructive: "#ef4444",
      border: "#e5e7eb",
      input: "#e5e7eb",
      ring: "#3b82f6",
      radius: "0.375rem",
    },
    dark: {
      background: "#171717",
      foreground: "#e5e5e5",
      card: "#262626",
      "card-foreground": "#e5e5e5",
      primary: "#3b82f6",
      "primary-foreground": "#ffffff",
      muted: "#1f1f1f",
      "muted-foreground": "#a3a3a3",
      accent: "#1e3a8a",
      "accent-foreground": "#bfdbfe",
      destructive: "#ef4444",
      border: "#404040",
      input: "#404040",
      ring: "#3b82f6",
      radius: "0.375rem",
    },
  },
  {
    id: "neo-brutalism",
    label: "Neo Brutalism",
    light: {
      background: "#ffffff",
      foreground: "#000000",
      card: "#ffffff",
      "card-foreground": "#000000",
      primary: "#ff3333",
      "primary-foreground": "#ffffff",
      muted: "#f0f0f0",
      "muted-foreground": "#333333",
      accent: "#ffff00",
      "accent-foreground": "#000000",
      destructive: "#000000",
      border: "#000000",
      input: "#000000",
      ring: "#ff3333",
      radius: "0px",
    },
    dark: {
      background: "#000000",
      foreground: "#ffffff",
      card: "#333333",
      "card-foreground": "#ffffff",
      primary: "#ff6666",
      "primary-foreground": "#000000",
      muted: "#1a1a1a",
      "muted-foreground": "#cccccc",
      accent: "#ffff33",
      "accent-foreground": "#000000",
      destructive: "#ffffff",
      border: "#ffffff",
      input: "#ffffff",
      ring: "#ff6666",
      radius: "0px",
    },
  },
];

/** Tokens the controls can override on top of a preset. */
export type Overrides = Partial<Pick<ThemeTokens, "primary" | "radius">>;

/**
 * Relative luminance of a `#rrggbb` colour, per WCAG. Used to keep the label
 * on a primary-coloured button readable whatever the user picks: the preset's
 * own `primary-foreground` is only correct for the preset's own primary.
 */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0.5;
  const channels = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function resolveTokens(
  theme: Theme,
  mode: "light" | "dark",
  overrides: Overrides,
): ThemeTokens {
  const tokens = { ...theme[mode], ...overrides };
  if (overrides.primary) {
    tokens["primary-foreground"] =
      luminance(overrides.primary) > 0.45 ? "#000000" : "#ffffff";
  }
  return tokens;
}

/** The CSS a user pastes into their own globals.css to get this look. */
export function toCss(theme: Theme, overrides: Overrides): string {
  const block = (mode: "light" | "dark") =>
    Object.entries(resolveTokens(theme, mode, overrides))
      .map(([key, value]) => `  --${key}: ${value};`)
      .join("\n");

  return `:root {\n${block("light")}\n}\n\n.dark {\n${block("dark")}\n}\n`;
}
