import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

import { CtaLink } from "@/components/home/cta-button";
import { gutter } from "@/components/home/section";

const storageProviders = [
  { src: "/storage/amazon-s3.png", alt: "Amazon S3", width: 18, height: 22 },
  { src: "/storage/wasabi.svg", alt: "Wasabi", width: 22, height: 22 },
  {
    src: "/storage/cloudflare-r2.svg",
    alt: "Cloudflare R2",
    width: 24,
    height: 24,
  },
  {
    src: "/storage/azure-blob.svg",
    alt: "Azure Blob Storage",
    width: 22,
    height: 22,
  },
  { src: "/storage/vultr.svg", alt: "Vultr Object Storage", width: 28, height: 17 },
  {
    src: "/storage/google-cloud.svg",
    alt: "Google Cloud Storage",
    width: 24,
    height: 24,
  },
  { src: "/storage/backblaze.svg", alt: "Backblaze B2", width: 22, height: 22 },
  { src: "/storage/scaleway.svg", alt: "Scaleway Object Storage", width: 22, height: 22 },
  { src: "/storage/storj.svg", alt: "Storj", width: 22, height: 22 },
];

export function Hero() {
  return (
    <section className={`${gutter} pb-14 pt-14 md:pb-24 md:pt-24`}>
      <Link
        href="https://openalternative.co/openinary"
        target="_blank"
        rel="noopener noreferrer"
        data-track-event="open_alternative_clicked"
        data-track-prop-location="hero"
        className="inline-flex h-[26px] items-center gap-2 rounded-full border border-border pl-3 pr-2.5 text-xs text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
      >
        <Sparkles className="size-3.5 text-foreground" aria-hidden />
        Featured on Open Alternative
        <ArrowRight className="size-3" aria-hidden />
      </Link>

      <h1 className="mt-11 text-balance text-[2.25rem] font-semibold leading-[1.05] tracking-[-0.03em] text-foreground sm:max-w-[18ch] sm:text-5xl lg:text-[3.4rem]">
        Open-source, self-hostable alternative to Cloudinary
      </h1>

      <p className="mt-6 max-w-[36rem] text-[17px] leading-[1.63] text-muted-foreground">
        Keep your media in an environment you trust. Fast delivery, low costs,
        and complete control, built to be open.
      </p>

      <div className="mt-9 flex flex-wrap items-center gap-3">
        <CtaLink
          href="https://app.openinary.dev"
          target="_blank"
          rel="noopener noreferrer"
          data-track-event="cloud_cta_clicked"
          data-track-prop-location="hero"
        >
          Try Cloud for free
        </CtaLink>
        <CtaLink
          href="https://docs.openinary.dev/"
          target="_blank"
          rel="noopener noreferrer"
          variant="outline"
          data-track-event="docs_clicked"
          data-track-prop-location="hero"
        >
          Documentation
        </CtaLink>
      </div>

      <p className="mt-5 font-mono text-xs text-muted-foreground/90">
        ~ npx create-openinary@latest
      </p>

      <div className="mt-14 md:mt-20">
        <p className="text-[11px] uppercase leading-[1.5] tracking-[0.14em] text-muted-foreground/80">
          Built around the storage you already use
        </p>
        <ul className="mt-4 flex flex-wrap items-center gap-x-7 gap-y-5 opacity-70 grayscale dark:opacity-75 dark:invert">
          {storageProviders.map((provider) => (
            <li key={provider.alt} className="flex h-6 items-center">
              <Image
                src={provider.src}
                alt={provider.alt}
                width={provider.width}
                height={provider.height}
                className="h-auto max-h-6 w-auto"
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
