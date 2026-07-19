"use client"

import { Toaster as Sonner, ToasterProps } from "sonner"
import { Spinner } from "./spinner"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      position="bottom-center"
      icons={{
        loading: <Spinner size={16} className="text-white" />,
      }}
      style={
        {
          "--normal-bg": "oklch(0.205 0 0)",
          "--normal-text": "oklch(0.985 0 0)",
          "--normal-border": "oklch(1 0 0 / 10%)",
        } as React.CSSProperties
      }
      toastOptions={{
        unstyled: false,
        classNames: {
          toast:
            "!w-fit !max-w-[90vw] !rounded-full !gap-3 !py-2.5 !px-4 !shadow-lg",
          content: "!flex-none",
          title: "!text-sm !font-medium !whitespace-nowrap",
          description: "!whitespace-nowrap",
          icon: "!m-0",
          actionButton:
            "!ml-1 !h-7 !shrink-0 !whitespace-nowrap !rounded-full !bg-white/15 !px-3 !text-xs !font-semibold !text-white hover:!bg-white/25",
          cancelButton:
            "!ml-1 !h-7 !shrink-0 !whitespace-nowrap !rounded-full !bg-white/10 !px-3 !text-xs !font-semibold !text-white hover:!bg-white/20",
          closeButton:
            "!left-auto !right-0 !translate-x-1/3 !-translate-y-1/3 !bg-neutral-800 !border-white/10 !text-white",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
