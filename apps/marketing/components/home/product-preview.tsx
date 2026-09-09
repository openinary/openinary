import Image from "next/image";

import { ctaButton, focusRing } from "@/components/home/cta-button";
import { cn } from "@/lib/utils";

/**
 * Full-bleed product shot, exported flat from the Figma frame: the painted
 * backdrop and the dashboard are baked into one file rather than stacked at
 * runtime, so there is no inset to keep in step across breakpoints.
 *
 * The whole shot links to the Cloud app: analytics showed plenty of visitors
 * clicking it expecting a live demo, so the click goes somewhere real, and
 * hovering says so before they commit. On touch there is no hover, the
 * overlay just never shows and the tap still lands in the app.
 *
 * This is where the product video goes once it exists.
 */
export function ProductPreview() {
  return (
    <section>
      <a
        href="https://app.openinary.dev"
        target="_blank"
        rel="noopener noreferrer"
        data-track-event="cloud_cta_clicked"
        data-track-prop-location="product_preview"
        className={cn("group relative block", focusRing)}
      >
        <Image
          src="/product/preview.png"
          alt="The Openinary dashboard listing images and videos in a bucket"
          width={2196}
          height={1698}
          sizes="(max-width: 1100px) 100vw, 1100px"
          // next/image re-encodes on the way out and defaults to 75, which is
          // where the text in a UI shot starts to smear. The source is a
          // lossless PNG, so this is the only place quality is decided.
          quality={88}
          priority
          className="h-auto w-full"
        />
        {/* Hidden by opacity, not display, so the reveal can fade and the
            link's accessible name always includes the call to action. The
            scrim leans on --background, which keeps it a light veil in light
            mode and a dark one in dark. */}
        <span
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/55 opacity-0 backdrop-blur-[2px] transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
        >
          <span className={ctaButton()}>Try Cloud for free</span>
          <span className="text-xs font-medium text-foreground/80">
            Nothing to install, no credit card.
          </span>
        </span>
      </a>
    </section>
  );
}
