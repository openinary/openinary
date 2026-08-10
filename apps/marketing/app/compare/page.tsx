import competitorsData from "@/data/competitors.json";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Compare Openinary vs Competitors — Open-source Media Platform",
  description:
    "See how Openinary compares to Cloudinary, ImageKit, Uploadcare and other media management platforms. Open-source, self-hostable, no vendor lock-in.",
};

export default function CompareIndexPage() {
  const competitors = Object.values(competitorsData.competitors);

  return (
    <div className="bg-background overflow-x-clip">
      <div className="relative mx-auto max-w-screen-xl border-x">
        <Header />
        <main className="mx-auto max-w-4xl px-4 py-12 md:px-6 md:py-20 min-h-[80vh]">
          <div className="mb-12 text-center">
            <h1 className="text-3xl font-semibold tracking-tight lg:text-4xl mb-4">
              Openinary vs the competition
            </h1>
            <p className="text-muted-foreground max-w-[600px] mx-auto leading-relaxed">
              See how the open-source, self-hostable media platform compares to
              the proprietary alternatives.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {competitors.map((competitor) => (
              <Link
                key={competitor.slug}
                href={`/compare/${competitor.slug}`}
                className="group relative rounded-lg border bg-card p-6 transition-colors hover:border-foreground/20 hover:bg-accent/50"
                data-track-event="comparison_clicked"
                data-track-prop-location="compare_index"
              >
                <h2 className="text-lg font-semibold mb-2">
                  vs {competitor.name}
                </h2>
                <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                  {competitor.description}
                </p>
                <span className="inline-flex items-center gap-1 text-sm font-medium group-hover:underline">
                  View comparison
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}
