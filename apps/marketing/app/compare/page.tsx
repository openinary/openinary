import competitorsData from "@/data/competitors.json";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";

import { PageIntro, PageShell } from "@/components/page-shell";
import { focusRing, pressable } from "@/components/home/cta-button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Compare Openinary vs Competitors — Open-source Media Platform",
  description:
    "See how Openinary compares to Cloudinary, ImageKit, Uploadcare and other media management platforms. Open-source, self-hostable, no vendor lock-in.",
};

export default function CompareIndexPage() {
  const competitors = Object.values(competitorsData.competitors);

  return (
    <PageShell>
      <PageIntro
        eyebrow="Compare"
        title="Openinary vs the competition"
        lede="See how the open-source, self-hostable media platform compares to the proprietary alternatives."
      />

      {/* Hairlines from the 1px gap over a border-coloured ground, like the
          feature grid; the grid's own pt-px draws the top rule, so the section
          carries no border-t of its own, which would double it. Seven cards
          fill neither two columns nor three, so the fillers below square off
          the last row: one from sm, where the grid is 2-up and needs an eighth
          cell, and a second from lg, where 3-up needs a ninth. */}
      <section>
        <div className="grid gap-px bg-border pt-px sm:grid-cols-2 lg:grid-cols-3">
          {competitors.map((competitor) => (
            <Link
              key={competitor.slug}
              href={`/compare/${competitor.slug}`}
              data-track-event="comparison_clicked"
              data-track-prop-location="compare_index"
              className={cn(
                "group flex flex-col bg-background px-6 py-8 transition-colors hover:bg-muted/40 md:px-8",
                focusRing,
                pressable,
              )}
            >
              <h2 className="text-sm font-medium leading-5 text-foreground">
                vs {competitor.name}
              </h2>
              <p className="mt-2.5 line-clamp-3 text-sm leading-[1.63] text-muted-foreground">
                {competitor.description}
              </p>
              <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-foreground">
                View comparison
                <ArrowRight
                  className="size-3.5 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </span>
            </Link>
          ))}
          <div aria-hidden className="hidden bg-background sm:block" />
          <div aria-hidden className="hidden bg-background lg:block" />
        </div>
      </section>
    </PageShell>
  );
}
