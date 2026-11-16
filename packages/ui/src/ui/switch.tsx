"use client";

import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";

import { cn } from "../lib/utils";

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-5 w-[34px] shrink-0 items-center rounded-full p-0.5 outline-none transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-ds-ring focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:bg-ds-inverse data-[state=unchecked]:bg-ds-border-hover",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-4 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.2)] transition-transform duration-200 ease-move dark:data-[state=checked]:bg-ds-inverse-text",
          "data-[state=checked]:translate-x-3.5 data-[state=unchecked]:translate-x-0",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
