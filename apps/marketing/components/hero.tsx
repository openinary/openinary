"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowRightIcon, Check } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import GradientWaveText from "./gradient-wave-text";
import { DottedGlowBackground } from "./ui/dotted-glow-background";
import { FullWidthDivider } from "@/components/ui/full-width-divider";

export function HeroSection() {
  return (
    <section>
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
      <div className="relative flex flex-col items-center justify-center gap-5 px-6 py-14 sm:gap-5 md:px-4 md:py-24 lg:py-28">
        {/* X Faded Borders & Shades */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-1 size-full overflow-hidden"
        >
          <div
            className={cn(
              "absolute -inset-x-20 inset-y-0 z-0 rounded-full",
              "bg-[radial-gradient(ellipse_at_center,theme(--color-foreground/.1),transparent,transparent)]",
              "blur-[50px]",
            )}
          />
          <div className="absolute inset-y-0 left-2 w-px bg-linear-to-b from-transparent via-border to-border sm:left-4 md:left-8" />
          <div className="absolute inset-y-0 right-2 w-px bg-linear-to-b from-transparent via-border to-border sm:right-4 md:right-8" />
          <div className="absolute inset-y-0 left-5 hidden w-px bg-linear-to-b from-transparent via-border/50 to-border/50 sm:block md:left-12" />
          <div className="absolute inset-y-0 right-5 hidden w-px bg-linear-to-b from-transparent via-border/50 to-border/50 sm:block md:right-12" />
        </div>
        <a
          className={cn(
            "group mx-auto flex w-fit items-center gap-3 rounded-sm border bg-card p-1 shadow",
            "fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards transition-all delay-500 duration-500 ease-out",
          )}
          href="https://openalternative.co/alternatives/cloudinary?utm_source=openinary.dev"
          target="_blank"
          rel="noopener noreferrer"
          data-track-event="open_alternative_clicked"
          data-track-prop-location="hero"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 327 309"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="flex-shrink-0"
          >
            <path
              fill="currentColor"
              d="M311.63,154.67 L311.63,139.84 L190.93,146.79 C186.72,147.02 183.12,143.79 182.89,139.59 C182.79,137.72 183.36,135.98 184.4,134.59 L250.52,33.92 L224.82,19.08 L170.48,127.1 C168.58,130.86 163.99,132.38 160.23,130.48 C158.69,129.7 157.53,128.48 156.82,127.05 L102.51,19.08 L76.81,33.92 L143.19,134.98 C145.5,138.5 144.52,143.22 141.01,145.54 C139.59,146.47 137.98,146.87 136.4,146.78 L136.4,146.8 L15.7,139.85 L15.7,169.51 L136.4,162.56 C140.61,162.33 144.21,165.55 144.44,169.76 C144.54,171.62 143.96,173.37 142.93,174.76 L76.81,275.43 L89.68,282.86 L89.69,282.85 L102.53,290.26 L156.86,182.25 C158.76,178.49 163.35,176.97 167.11,178.87 C168.65,179.65 169.81,180.87 170.52,182.3 L224.83,290.26 L237.66,282.85 L238.09,282.62 L250.53,275.43 L184.16,174.37 C181.85,170.85 182.83,166.13 186.34,163.82 C187.76,162.89 189.37,162.49 190.94,162.58 L190.94,162.57 L311.64,169.52 L311.64,154.69 L311.63,154.67 Z M326.94,131.75 L326.94,177.59 L326.92,177.59 L326.91,178.01 C326.68,182.22 323.08,185.44 318.87,185.21 L205.21,178.67 L267.68,273.78 L267.93,274.19 C270.02,277.84 268.77,282.5 265.12,284.6 L245.69,295.81 L245.3,296.05 L225.45,307.51 L225.06,307.72 C221.3,309.62 216.71,308.11 214.81,304.34 L163.66,202.66 L112.59,304.19 C112.5,304.37 112.41,304.55 112.31,304.73 C110.2,308.38 105.52,309.62 101.88,307.51 L82.03,296.05 L82.04,296.04 L62.21,284.6 L61.82,284.36 C58.3,282.05 57.33,277.32 59.64,273.8 L122.12,178.67 L9.03,185.18 C8.71,185.22 8.38,185.24 8.05,185.24 C3.82,185.24 0.4,181.81 0.4,177.59 L0.4,131.75 L0.42,131.75 L0.43,131.33 C0.66,127.12 4.26,123.89 8.47,124.13 L122.13,130.68 L59.66,35.57 L59.41,35.16 C57.32,31.51 58.57,26.85 62.22,24.76 L101.51,2.07 C101.75,1.91 102.01,1.76 102.28,1.63 C106.04,-0.27 110.64,1.24 112.54,5.01 L163.69,106.69 L214.84,5.01 L214.85,5.02 L215.05,4.65 C217.14,1 221.8,-0.26 225.45,1.84 L265.15,24.76 L265.54,25 C269.06,27.31 270.03,32.04 267.72,35.55 L205.24,130.68 L318.33,124.16 C318.65,124.12 318.98,124.1 319.31,124.1 C323.54,124.1 326.96,127.53 326.96,131.75 L326.94,131.75 Z"
            />
          </svg>
          <p className="font-mono text-[10px] sm:text-xs">
            Featured on Open Alternative
          </p>

          <div className="pr-1">
            <ArrowRightIcon className="size-3 -translate-x-0.5 duration-150 ease-out group-hover:translate-x-0.5" />
          </div>
        </a>

        <GradientWaveText
          delay={0.5}
          customColors={["#e63946", "#f72585", "#b5179e", "#7209b7"]}
          className={cn(
            "max-w-4xl text-balance text-center text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:text-6xl",
            "fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards delay-100 duration-500 ease-out z-0",
          )}
        >
          Open-source, self-hostable alternative to Cloudinary
        </GradientWaveText>

        <p
          className={cn(
            "max-w-[340px] text-center text-sm text-muted-foreground tracking-wide sm:max-w-[500px] sm:text-lg md:max-w-[600px]",
            "fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards delay-200 duration-500 ease-out z-10",
          )}
        >
          Store your media in an environment you trust. Fast, cheap, and open.
        </p>

        {/* 3 Pillars */}
        <ul
          className={cn(
            "flex flex-row flex-wrap justify-center gap-x-4 gap-y-2 mt-2 sm:mt-2 sm:gap-4",
            "fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards delay-250 duration-500 ease-out z-10",
          )}
        >
          <li className="flex items-center gap-1.5">
            <Check className="size-4 text-green-600 flex-shrink-0 sm:size-5" />
            <span className="text-xs font-medium sm:text-sm">
              Self-hostable
            </span>
          </li>
          <li className="flex items-center gap-1.5">
            <Check className="size-4 text-green-600 flex-shrink-0 sm:size-5" />
            <span className="text-xs font-medium sm:text-sm">
              No vendor lock-in
            </span>
          </li>
          <li className="flex items-center gap-1.5">
            <Check className="size-4 text-green-600 flex-shrink-0 sm:size-5" />
            <span className="text-xs font-medium sm:text-sm">
              Works with S3/R2/MinIO
            </span>
          </li>
        </ul>

        <div className="fade-in slide-in-from-bottom-10 flex w-full sm:w-fit animate-in flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 fill-mode-backwards pt-2 sm:pt-2 delay-300 duration-500 ease-out z-10">
          <Button
            asChild
            size="lg"
            className="w-full sm:w-auto"
            data-track-event="waitlist_clicked"
            data-track-prop-location="hero"
          >
            <Link href="https://app.openinary.dev">
              Try Openinary Cloud
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="w-full sm:w-auto"
            data-track-event="quickstart_clicked"
            data-track-prop-location="hero"
          >
            <Link
              href="https://docs.openinary.dev/quickstart"
              target="_blank"
              rel="noopener noreferrer"
            >
              Self-host guide
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Hero Image */}
      <div
        className={cn(
          "relative",
          "fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards delay-500 duration-700 ease-out",
        )}
      >
        <FullWidthDivider position="top" />
        {/* The screenshot is the most-clicked "button" on the page (session
            replays) - so it is one. */}
        <Link
          href="https://app.openinary.dev"
          aria-label="Open the Openinary Cloud app"
          className="block overflow-hidden"
          data-track-event="cloud_app_clicked"
          data-track-prop-location="hero_image"
        >
          <Image
            src="/hero-light.png"
            alt="Openinary dashboard"
            width={1920}
            height={1080}
            sizes="(max-width: 1280px) 100vw, 1280px"
            className="block origin-top-right scale-[1] sm:scale-100 dark:hidden"
            priority
          />
          <Image
            src="/hero-dark.png"
            alt="Openinary dashboard"
            width={1920}
            height={1080}
            sizes="(max-width: 1280px) 100vw, 1280px"
            className="hidden origin-top-right scale-[1] sm:scale-100 dark:block"
            priority
          />
        </Link>
      </div>
    </section>
  );
}
