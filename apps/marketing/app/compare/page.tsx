import competitorsData from "@/data/competitors.json";
import type { Metadata } from "next";
import Link from "next/link";

import { compareCopy } from "./[slug]/copy";
import { FinalCta, PageHero, SiteShell } from "@/components/site/shell";
import { Container } from "@/components/site/ui";

export const metadata: Metadata = {
  title: "Compare Openinary | Open-source media platform",
  description:
    "Openinary side by side with Cloudinary, ImageKit, Uploadcare, imgix and others, and when each one is the better pick.",
  alternates: { canonical: "/compare" },
};

export default function CompareIndexPage() {
  return (
    <SiteShell>
      <PageHero
        title="Openinary, side by side. And when to pick the other one."
        lede="Every comparison lists where each one starts, the facts we checked on their own site, and an honest case for choosing them."
        location="compare_index_hero"
      />
      <Container className="pb-16">
        <ul className="border-b-[0.5px] border-rule">
          {Object.values(competitorsData.competitors).map((c) => (
            <li key={c.slug}>
              <Link
                href={`/compare/${c.slug}`}
                className="group grid gap-1 border-t-[0.5px] border-rule py-5 transition-colors md:grid-cols-[260px_1fr_auto] md:items-center md:gap-8"
              >
                <span className="text-[17px] tracking-[-0.02em] text-ink-12">Openinary vs {c.name}</span>
                <span className="text-[13px] leading-5 text-ink-11">
                  {compareCopy[c.slug]?.difference.split(". ")[1]}.
                </span>
                <span aria-hidden className="hidden text-ink-10 transition-transform duration-150 ease-(--ease-out) group-hover:translate-x-0.5 group-hover:text-ink-12 md:block">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
      <FinalCta location="compare_index_cta" />
    </SiteShell>
  );
}
