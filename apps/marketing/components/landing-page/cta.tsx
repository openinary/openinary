"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { FullWidthDivider } from "../ui/full-width-divider";
import { DottedGlowBackground } from "@/components/ui/dotted-glow-background";
import { ArrowRightIcon } from "lucide-react";

export default function CTASection() {
  return (
    <section
      className="px-6 py-10 md:py-20 border-b scroll-mt-[100px] relative"
      id="cta"
    >
      <DottedGlowBackground
        className="pointer-events-none mask-radial-to-90% mask-radial-at-center opacity-20 dark:opacity-40"
        opacity={1}
        gap={10}
        radius={1.6}
        colorLightVar="--color-neutral-500"
        glowColorLightVar="--background"
        colorDarkVar="--color-neutral-500"
        glowColorDarkVar="--background"
        backgroundOpacity={0}
        speedMin={0.3}
        speedMax={1.6}
        speedScale={1}
      />
      <FullWidthDivider position="top" />
      <FullWidthDivider position="bottom" />
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 md:gap-8">
        <div className="flex-1">
          <h2 className="text-3xl font-semibold tracking-tight lg:text-4xl mb-4">
            Store your media in an environment you trust.
          </h2>
        </div>

        <div className="flex-shrink-0 flex flex-col sm:flex-row gap-3">
          <Button
            asChild
            size="default"
            data-track-event="waitlist_cta_clicked"
            data-track-prop-location="cta"
          >
            <Link href="https://app.openinary.dev">
              Try Openinary Cloud
            </Link>
          </Button>
          <Button
            asChild
            size="default"
            variant="outline"
            data-track-event="self_host_cta_clicked"
          >
            <Link href="https://docs.openinary.dev/quickstart" target="_blank" rel="noopener noreferrer">
              Self-host guide
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
