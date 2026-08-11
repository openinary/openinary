import competitorsData from "@/data/competitors.json";
import { notFound } from "next/navigation";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { ComparisonTable } from "./comparison-table";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <div className="bg-background overflow-x-clip">
      <div className="relative mx-auto max-w-screen-xl border-x">
        <Header />
        <main className="mx-auto max-w-4xl px-4 py-12 md:px-6 md:py-20">
          <Link
            href="/compare"
            data-track-event="back_to_comparisons_clicked"
            data-track-prop-location="compare"
          >
            <Button variant="ghost" size="sm" className="mb-6 -ml-2 gap-1">
              <ChevronLeft className="size-4" />
              All comparisons
            </Button>
          </Link>

          <div className="mb-12">
            <h1 className="text-3xl font-semibold tracking-tight lg:text-4xl mb-4">
              Openinary vs {competitor.name}
            </h1>
            <p className="text-muted-foreground max-w-[700px] leading-relaxed">
              {competitor.description}
            </p>
          </div>

          {/* Highlights */}
          <div className="mb-12 rounded-lg border bg-card p-6">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
              Why choose Openinary?
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {competitorsData.openinary.highlights.map((highlight) => (
                <li key={highlight} className="flex items-start gap-2 text-sm">
                  <svg
                    className="mt-0.5 size-4 shrink-0 text-green-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  {highlight}
                </li>
              ))}
            </ul>
          </div>

          {/* Comparison Table */}
          <ComparisonTable
            features={competitorsData.features}
            competitorSlug={slug}
            competitorName={competitor.name}
          />

          {/* CTA */}
          <div className="mt-16 text-center">
            <h2 className="text-2xl font-semibold tracking-tight mb-3">
              Ready to switch?
            </h2>
            <p className="text-muted-foreground mb-6">
              Get started with Openinary in under 5 minutes. Self-host for free
              or let us handle the hosting.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button
                asChild
                data-track-event="quickstart_clicked"
                data-track-prop-location="compare_cta"
              >
                <a href="https://docs.openinary.dev/quickstart" target="_blank">
                  Self-host in 5 minutes
                </a>
              </Button>
              <Button
                asChild
                variant="outline"
                data-track-event="cloud_waitlist_clicked"
                data-track-prop-location="compare_cta"
              >
                <a href="https://app.openinary.dev">
                  Try Openinary Cloud
                </a>
              </Button>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}
