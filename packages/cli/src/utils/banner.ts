import pc from "picocolors";

export const TAGLINE = "The self-hostable alternative to Cloudinary";

// "Openinary" wordmark (figlet small).
const ART = [
  "   ___                 _",
  "  / _ \\ _ __  ___ _ _ (_)_ _  __ _ _ _ _  _",
  " | (_) | '_ \\/ -_) ' \\| | ' \\/ _` | '_| || |",
  "  \\___/| .__/\\___|_||_|_|_||_\\__,_|_|  \\_, |",
  "       |_|                             |__/",
];

const artWidth = (lines: string[]): number => Math.max(...lines.map((l) => [...l].length));

const ART_WIDTH = artWidth(ART);

// Left-to-right gradient stops: dark red → red → light red.
const GRADIENT: [number, number, number][] = [
  [153, 27, 27],
  [239, 68, 68],
  [252, 165, 165],
];

function supportsTruecolor(): boolean {
  if (!pc.isColorSupported) return false;
  const colorterm = process.env.COLORTERM ?? "";
  if (colorterm.includes("truecolor") || colorterm.includes("24bit")) return true;
  return ["iTerm.app", "vscode", "ghostty", "WezTerm", "Hyper"].includes(
    process.env.TERM_PROGRAM ?? ""
  );
}

function gradientAt(t: number): [number, number, number] {
  const pos = t * (GRADIENT.length - 1);
  const i = Math.min(Math.floor(pos), GRADIENT.length - 2);
  const f = pos - i;
  const [from, to] = [GRADIENT[i], GRADIENT[i + 1]];
  return [
    Math.round(from[0] + (to[0] - from[0]) * f),
    Math.round(from[1] + (to[1] - from[1]) * f),
    Math.round(from[2] + (to[2] - from[2]) * f),
  ];
}

function renderArt(lines: string[]): string {
  const width = artWidth(lines);
  const truecolor = supportsTruecolor();
  return lines
    .map((line) =>
      [...line.padEnd(width)]
        .map((ch, x) => {
          if (ch === " ") return ch;
          if (!truecolor) return pc.red(ch);
          const [r, g, b] = gradientAt(x / (width - 1));
          return `\x1b[38;2;${r};${g};${b}m${ch}\x1b[39m`;
        })
        .join("")
    )
    .join("\n");
}

export function renderLogo(): string {
  return renderArt(ART);
}

function isCI(): boolean {
  return process.env.CI === "true" || process.env.CI === "1";
}

/**
 * Renders the startup banner (logo + tagline + version), or a compact
 * one-liner when the terminal is too narrow. Empty when stdout isn't a
 * TTY (piped output, CI logs) so scripts stay clean.
 */
export function renderBanner(version: string): string {
  if (!process.stdout.isTTY || isCI()) return "";

  const byline = `${pc.dim(TAGLINE)} ${pc.dim("·")} ${pc.dim(`v${version}`)}`;
  const columns = process.stdout.columns || 80;

  if (columns < ART_WIDTH + 2) {
    return `\n${pc.bold(pc.red("openinary"))} ${pc.dim(`v${version}`)}\n${pc.dim(TAGLINE)}\n`;
  }

  const logo = renderArt(ART)
    .split("\n")
    .map((line) => ` ${line}`)
    .join("\n");
  return `\n${logo}\n\n  ${byline}\n`;
}

export function showBanner(version: string): void {
  const banner = renderBanner(version);
  if (banner) console.log(banner);
}
