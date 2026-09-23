import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { CtaLink } from "@/components/home/cta-button";
import { CopyCommand } from "@/components/home/copy-command";
import { gutter } from "@/components/home/section";
import { StorageStrip } from "@/components/home/storage-strip";


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
        <OpenAlternativeMark />
        Featured on Open Alternative
        <ArrowRight className="size-3" aria-hidden />
      </Link>

      <h1 className="mt-6 text-balance text-[2.25rem] font-semibold leading-[1.05] tracking-[-0.03em] text-foreground sm:max-w-[18ch] sm:text-5xl lg:text-[3.4rem]">
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

      <div className="mt-4">
        <CopyCommand command="npx create-openinary@latest" />
      </div>

      <div className="mt-14 md:mt-20">
        <p className="text-[11px] uppercase leading-[1.5] tracking-[0.14em] text-muted-foreground/80">
          Built around the storage you already use
        </p>
        <div className="mt-4">
          <StorageStrip />
        </div>
      </div>
    </section>
  );
}

/**
 * Open Alternative's own mark. Inlined with fill: currentColor so it inverts in
 * dark mode; the supplied file hardcodes #0A0A0A, which would vanish there.
 */
function OpenAlternativeMark() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="currentColor"
      aria-hidden
      className="size-3.5 shrink-0 text-foreground"
    >
      <path d="M13.3248 6.58731V5.95239L8.15725 6.24994C7.977 6.25979 7.82287 6.1215 7.81303 5.94169C7.80875 5.86162 7.83315 5.78713 7.87768 5.72762L10.7085 1.41759L9.6082 0.782236L7.28171 5.40694C7.20037 5.56792 7.00385 5.633 6.84287 5.55165C6.77694 5.51826 6.72728 5.46603 6.69688 5.4048L4.37168 0.782236L3.27138 1.41759L6.11333 5.74432C6.21223 5.89502 6.17028 6.0971 6.02 6.19642C5.9592 6.23624 5.89028 6.25337 5.82263 6.24951V6.25037L0.655046 5.95282V7.22266L5.82263 6.92511C6.00287 6.91526 6.157 7.05312 6.16685 7.23337C6.17113 7.313 6.1463 7.38792 6.1022 7.44743L3.27138 11.7575L3.82239 12.0756L3.82281 12.0751L4.37254 12.3924L6.69859 7.76811C6.77994 7.60713 6.97645 7.54205 7.13743 7.6234C7.20336 7.65679 7.25303 7.70902 7.28343 7.77025L9.60862 12.3924L10.1579 12.0751L10.1763 12.0653L10.7089 11.7575L7.8674 7.43074C7.7685 7.28003 7.81046 7.07795 7.96073 6.97906C8.02153 6.93924 8.09046 6.92211 8.15768 6.92597V6.92554L13.3253 7.22309V6.58817L13.3248 6.58731ZM13.9803 5.60603V7.5686H13.9795L13.979 7.58658C13.9692 7.76682 13.815 7.90468 13.6348 7.89484L8.76862 7.61483L11.4432 11.6868L11.4539 11.7044C11.5434 11.8606 11.4898 12.0602 11.3336 12.1501L10.5017 12.63L10.485 12.6403L9.63517 13.1309L9.61847 13.1399C9.45749 13.2213 9.26098 13.1566 9.17963 12.9952L6.98973 8.64193L4.80324 12.9888C4.79939 12.9965 4.79553 13.0042 4.79125 13.0119C4.70092 13.1682 4.50055 13.2213 4.34471 13.1309L3.49486 12.6403L3.49529 12.6399L2.6463 12.1501L2.6296 12.1398C2.4789 12.0409 2.43737 11.8384 2.53627 11.6877L5.21125 7.61483L0.36948 7.89355C0.35578 7.89526 0.341651 7.89612 0.327523 7.89612C0.146422 7.89612 0 7.74927 0 7.5686V5.60603H0.000856268L0.0012844 5.58805C0.0111315 5.4078 0.16526 5.26951 0.345505 5.27979L5.21168 5.56022L2.53713 1.48823L2.52642 1.47068C2.43694 1.31441 2.49046 1.1149 2.64673 1.02542L4.32887 0.0539788C4.33914 0.0471287 4.35028 0.0407067 4.36183 0.0351409C4.52281 -0.0462046 4.71976 0.0184437 4.8011 0.17985L6.99101 4.53312L9.18092 0.17985L9.18135 0.180279L9.18991 0.164438C9.27939 0.00816845 9.4789 -0.0457765 9.63517 0.0441317L11.3349 1.02542L11.3516 1.03569C11.5023 1.13459 11.5438 1.3371 11.4449 1.48737L8.76991 5.56022L13.6117 5.28107C13.6254 5.27936 13.6395 5.2785 13.6536 5.2785C13.8347 5.2785 13.9812 5.42535 13.9812 5.60603H13.9803Z" />
    </svg>
  );
}
