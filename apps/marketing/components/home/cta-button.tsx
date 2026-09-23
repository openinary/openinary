import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Interactive states, kept identical to components/ui/button.tsx so every
 * clickable thing on the page behaves the same.
 *
 * The focus ring is wide, soft and flush against the control. The older shadcn
 * recipe (`ring-2 ring-ring ring-offset-2`) draws a hard, solid ring floating
 * two pixels off the edge, which reads as a different component next to a
 * current one.
 */
export const focusRing =
  "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Press feedback. `not-aria-[haspopup]` skips the dip for menu triggers, which
 * stay put while their popover opens.
 */
export const pressable =
  "cursor-pointer select-none active:not-aria-[haspopup]:translate-y-px";

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

/**
 * The two button shapes used across the marketing pages, straight from the
 * Figma frame: 38px tall, 10px radius, 14/20 medium label.
 */
export const ctaButton = cva(
  `inline-flex shrink-0 items-center justify-center gap-2 rounded-[10px] border border-transparent bg-clip-padding text-sm font-medium leading-5 whitespace-nowrap transition-all ${focusRing} ${pressable}`,
  {
    variants: {
      variant: {
        primary: "bg-foreground text-background hover:bg-foreground/90",
        outline:
          "border border-foreground/10 text-foreground hover:bg-muted hover:border-foreground/20",
      },
      size: {
        default: "h-[38px] px-4",
        sm: "h-[26px] rounded-lg px-2.5 text-[13px]",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export function CtaLink({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof Link> & VariantProps<typeof ctaButton>) {
  return (
    <Link className={cn(ctaButton({ variant, size, className }))} {...props} />
  );
}
