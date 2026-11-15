import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../lib/utils"

const badgeVariants = cva(
  "inline-flex h-[22px] w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-full border px-2 font-medium text-xs/none tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-ds-ring focus-visible:outline-offset-2 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-ds-inverse text-ds-inverse-text",
        secondary:
          "border-transparent bg-ds-hover text-ds-secondary",
        destructive:
          "border-ds-red/45 bg-ds-red/12 text-ds-red",
        outline:
          "border-ds-border-strong text-ds-secondary [a&]:hover:bg-ds-hover",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
