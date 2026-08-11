"use client";

import { X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

interface BannerProps {
  title?: string;
  description: string;
  linkText?: string;
  linkUrl?: string;
  defaultVisible?: boolean;
}

export default function Banner({
  title = "Version 2.0 is now available!",
  description = "Read the full release notes",
  linkText = "here",
  linkUrl = "#",
  defaultVisible = true,
}: BannerProps) {
  const [isVisible, setIsVisible] = useState(defaultVisible);

  const handleClose = () => {
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <section className="bg-background w-full border-b px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 text-center">
          <span className="text-sm">
            <span className="font-medium">{title}</span>{" "}
            <span className="text-muted-foreground">
              {description}{" "}
              <a
                href={linkUrl}
                className="hover:text-foreground underline underline-offset-2"
                data-track-event="banner_link_clicked"
                data-track-prop-location="banner"
              >
                {linkText}
              </a>
              .
            </span>
          </span>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="-mr-2 h-8 w-8 flex-none"
          onClick={handleClose}
          data-track-event="banner_close_clicked"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}

export { Banner };
