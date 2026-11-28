/** The marketing site's control classes (apps/marketing/components/site/ui.tsx and header.tsx). */
import { withBase } from "@cloudflare/nimbus-docs/runtime";

/**
 * Where the marketing pages are. In production the docs share openinary.dev
 * with them, so their links are plain paths (/pricing). `astro dev` serves the
 * docs alone, so links go to the marketing dev server instead; set
 * PUBLIC_MARKETING_URL to point them elsewhere.
 */
const MARKETING: string =
  import.meta.env.PUBLIC_MARKETING_URL ?? (import.meta.env.DEV ? "http://localhost:3211" : "");

/** A marketing page: `site("/pricing")`. */
export const site = (path: string) => `${MARKETING}${path}`;

/** A docs page, under the /docs base: `docs("/api-reference")`. */
export const docs = (path: string) => withBase(path, import.meta.env.BASE_URL);

/** The Cloud dashboard; PUBLIC_APP_URL points it at a local one. */
export const APP_URL: string = import.meta.env.PUBLIC_APP_URL ?? "https://app.openinary.dev";
export const GITHUB_URL = "https://github.com/openinary/openinary";

export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--nb-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-page";

/** Header and footer links: 32px, 13px medium, a chip on hover. */
export const linkClass = `press inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-[13px] font-medium text-ink-11 no-underline hover:bg-chip hover:text-ink-12 ${focusRing}`;

const buttonBase = `press inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3.5 text-[13px] font-medium leading-5 tracking-[-0.01em] no-underline ${focusRing}`;

export const buttonClass = {
  primary: `${buttonBase} bg-cta text-white shadow-[0_0_0_1px_var(--primary-ring)] hover:bg-cta-strong`,
  secondary: `${buttonBase} bg-control text-ink-12 ring-raised hover:bg-control-hover`,
};
