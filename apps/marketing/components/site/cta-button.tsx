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
