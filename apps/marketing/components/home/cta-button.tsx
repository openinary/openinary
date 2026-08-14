import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * The two button shapes used across the marketing pages, straight from the
 * Figma frame: 38px tall, 10px radius, 14/20 medium label.
 */
export const ctaButton = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-[10px] text-sm font-medium leading-5 whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
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
