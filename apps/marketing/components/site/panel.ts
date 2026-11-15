/**
 * Every field inside a control panel: same radius, same fill, same hairline.
 * Shared so the calculator's panel and the playground's theme editor read as
 * one component rather than two takes on the same idea.
 *
 * The explicit dark variant is there because the playground's panel forces a
 * theme on its own subtree.
 */
export const fieldShell =
  "rounded-md border border-border bg-background dark:bg-background";

/** Panel ground: a fraction of the way from the page toward muted. */
export const panelSurface =
  "bg-[color-mix(in_oklch,var(--muted)_35%,var(--background))]";

/**
 * The slider from https://coss.com/origin/r/comp-244.json: a tall, thin thumb
 * knocked out of the track rather than the default circle.
 */
export const sliderThumb =
  "**:data-[slot=slider-thumb]:shadow-none [&>:last-child>span]:h-6 [&>:last-child>span]:w-2.5 [&>:last-child>span]:border-[3px] [&>:last-child>span]:border-background [&>:last-child>span]:bg-primary [&>:last-child>span]:ring-offset-0";
