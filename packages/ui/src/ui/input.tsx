import * as React from "react"

import { cn } from "../lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-8 w-full min-w-0 rounded-[8px] border border-ds-border-strong bg-ds-field px-2.5 py-1 text-base text-ds-text outline-none transition-[border-color,box-shadow] selection:bg-ds-accent selection:text-white file:inline-flex file:h-6 file:border-0 file:bg-transparent file:font-medium file:text-[13px] file:text-ds-text placeholder:text-ds-faint hover:border-ds-border-hover disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-[13px]",
        "focus-visible:border-ds-ring focus-visible:ring-[3px] focus-visible:ring-ds-ring/20",
        "aria-invalid:border-ds-red aria-invalid:ring-[3px] aria-invalid:ring-ds-red/15",
        className
      )}
      {...props}
    />
  )
}

export { Input }
