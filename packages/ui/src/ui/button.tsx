import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] border border-transparent font-medium text-[13px]/4 outline-none transition-[background-color,border-color,color,scale] duration-150 focus-visible:outline-2 focus-visible:outline-ds-ring focus-visible:outline-offset-2 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100 [&_svg:not([class*='size-'])]:size-3.5 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-(--ds-accent-edge) bg-ds-accent text-white hover:bg-ds-accent-strong",
        destructive:
          "border-ds-red/50 bg-[#b42318] text-white hover:bg-[#a01f15]",
        ghostDestructive:
          "text-ds-red hover:border-ds-red/30 hover:bg-ds-red/10",
        outline:
          "border-ds-border-strong bg-ds-field text-ds-text hover:border-ds-border-hover hover:bg-ds-hover",
        secondary:
          "bg-ds-hover text-ds-text hover:bg-ds-active",
        ghost:
          "text-ds-secondary hover:bg-ds-hover hover:text-ds-text",
        link: "text-ds-blue underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-3",
        sm: "h-7 px-2.5 text-xs/4",
        xs: "h-[26px] px-2.5 text-xs/4",
        lg: "h-9 px-4 text-[13.5px]/5",
        icon: "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
