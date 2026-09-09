import competitorsData from "@/data/competitors.json";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Check, ChevronLeft } from "lucide-react";

import { ComparisonTable } from "./comparison-table";
import { PageIntro, PageShell } from "@/components/page-shell";
import { Cta } from "@/components/home/cta";
import { Eyebrow, gutter } from "@/components/home/section";
import { focusRing, pressable } from "@/components/home/cta-button";
import { cn } from "@/lib/utils";

type Params = { slug: string };

export function generateStaticParams() {
  return Object.keys(competitorsData.competitors).map((slug) => ({ slug }));
}

export function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Metadata | Promise<Metadata> {
  return params.then(({ slug }) => {
    const competitor =
      competitorsData.competitors[
        slug as keyof typeof competitorsData.competitors
      ];
    if (!competitor) return {};
    return {
      title: `Openinary vs ${competitor.name} — Open-source Alternative Comparison`,
      description: `Compare Openinary with ${competitor.name}. See how the open-source, self-hostable media platform stacks up against ${competitor.name} on features, pricing, and developer experience.`,
    };
  });
}

export default async function ComparePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const competitor =
    competitorsData.competitors[
      slug as keyof typeof competitorsData.competitors
    ];

  if (!competitor) {
    notFound();
  }

  return (
    <PageShell>
      <PageIntro
        eyebrow="Compare"
        title={`Openinary vs ${competitor.name}`}
        lede={competitor.description}
      >
        <Link
          href="/compare"
          data-track-event="back_to_comparisons_clicked"
          data-track-prop-location="compare"
          className={cn(
            "mb-8 inline-flex items-center gap-1 rounded-sm text-sm font-medium text-muted-foreground transition-all hover:text-foreground",
            focusRing,
            pressable,
          )}
        >
          <ChevronLeft className="size-4" aria-hidden />
          All comparisons
        </Link>
      </PageIntro>

      {/* Highlights: same block as the intro, no rule between them, the
          section's story runs straight from the pitch into the reasons. */}
      <section>
        <div className={`${gutter} pb-9`}>
          <Eyebrow>Why choose Openinary</Eyebrow>
        </div>
        <ul className={`${gutter} grid gap-x-8 gap-y-3 pb-14 sm:grid-cols-2 md:pb-20`}>
          {competitorsData.openinary.highlights.map((highlight) => (
            <li
              key={highlight}
              className="flex items-start gap-2.5 text-sm leading-[1.63] text-muted-foreground"
            >
              <Check
                className="mt-0.5 size-4 shrink-0 text-foreground"
                aria-hidden
              />
              {highlight}
            </li>
          ))}
        </ul>
      </section>

      {/* Feature by feature */}
      <section className="border-t border-border">
        {/* The eyebrow shares the well's geometry, so from md it sits flush
            with the table's left rule; below md the well spans the screen and
            the eyebrow falls back to the page gutter. */}
        <div className="mx-auto max-w-2xl px-6 pb-9 pt-14 md:px-0 md:pt-20">
          <Eyebrow>Feature by feature</Eyebrow>
        </div>
        {/* The table sits in a centred well, capped at reading width, whose
            side rules run from the full-width rule above down to the next
            section's border, the way the calculator's split ties into the
            page. The well only draws its sides from md, like the page column
            itself: below that it spans the screen and the rules would sit on
            the very edge. */}
        <div className="border-t border-border">
          <div className="mx-auto max-w-2xl border-border md:border-x">
            <ComparisonTable
              features={competitorsData.features}
              competitorSlug={slug}
              competitorName={competitor.name}
            />
          </div>
        </div>
      </section>

      <Cta location="compare_cta" />
    </PageShell>
  );
}
