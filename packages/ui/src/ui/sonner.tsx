"use client"

import { Toaster as Sonner, ToasterProps } from "sonner"
import { Spinner } from "./spinner"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      // A notch hanging from the top edge, in the inverse of the page: dark on
      // light, light on dark. One line of feedback, out of the way of the work.
      position="top-center"
      // Always listed, never collapsed into a pile: each pill hugs its own
      // text, so a wider toast behind a narrow one would poke out of both
      // sides of it.
      expand
      offset={0}
      mobileOffset={0}
      icons={{
        loading: <Spinner size={16} className="text-ds-inverse-text" />,
      }}
      style={
        {
          "--normal-bg": "var(--ds-inverse)",
          "--normal-text": "var(--ds-inverse-text)",
          "--normal-border": "transparent",
        } as React.CSSProperties
      }
      toastOptions={{
        unstyled: false,
        classNames: {
          // inset-x-0 + mx-auto because "!w-fit" drops the width sonner
          // positions against: without them the pill is laid out from the
          // container's left edge and drifts off-centre as its text changes
          // length. Nothing else may translate it on x, or it centres twice.
          // Only the newest toast hangs from the top edge as a notch; the
          // ones under it float free once the stack expands on hover, so
          // they keep all four corners.
          toast:
            "!w-fit !max-w-[min(560px,calc(100vw-48px))] !rounded-[14px] data-[index=0]:!rounded-t-none !gap-2.5 !py-2.5 !px-5 !shadow-[0_8px_24px_-8px_rgb(0_0_0/0.35)] !inset-x-0 !mx-auto",
          // flex-initial + min-w-0, not flex-none: the pill still hugs short
          // text (no grow), but once it hits max-w the content may shrink -
          // flex-none pinned it at the intrinsic width of the nowrap title,
          // so a long filename pushed the text out of the pill. truncate
          // ellipsizes what no longer fits.
          content: "!flex-initial !min-w-0",
          title: "!text-[14px]/5 !font-medium !truncate",
          description: "!truncate !text-[12.5px]/[18px] !opacity-70",
          icon: "!m-0",
          actionButton:
            "!ml-1 !h-7 !shrink-0 !whitespace-nowrap !rounded-full !bg-ds-inverse-text/15 !px-3 !text-[13px] !font-medium !text-ds-inverse-text hover:!bg-ds-inverse-text/25",
          cancelButton:
            "!ml-1 !h-7 !shrink-0 !whitespace-nowrap !rounded-full !bg-ds-inverse-text/10 !px-3 !text-[13px] !font-medium !text-ds-inverse-text hover:!bg-ds-inverse-text/20",
          closeButton:
            "!left-auto !right-0 !translate-x-1/3 !translate-y-1/3 !top-auto !bottom-0 !bg-ds-inverse !border-ds-inverse-text/15 !text-ds-inverse-text",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
