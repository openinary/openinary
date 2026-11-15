import competitorsData from "@/data/competitors.json";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";

import { ComparisonTable, Value, Who, type FeatureCategory } from "./comparison-table";
import { compareCopy } from "./copy";
import { FaqBlock, FinalCta, PageHero, SiteShell } from "@/components/site/shell";
import { Container, DOCS_URL, H2, Lede } from "@/components/site/ui";

type Params = { slug: string };
type Slug = keyof typeof competitorsData.competitors;

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(competitorsData.competitors).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const competitor = competitorsData.competitors[slug as Slug];
  if (!competitor) return {};
  return {
    title: `Openinary vs ${competitor.name} | Open-source alternative`,
    description: `Openinary and ${competitor.name} side by side: storage, transformations, video, pricing and when each one is the better pick.`,
    alternates: { canonical: `/compare/${slug}` },
  };
}

/** The lines worth reading first, pulled from the full table. */
const glance = ["Open source", "Self-hostable", "Bring your own storage", "Free tier", "Paid plans from"];

function Card({ name, us, rows }: { name: string; us?: boolean; rows: [string, boolean | string][] }) {
  return (
    <div className={us ? "rounded-lg bg-tile p-6 md:p-8" : "rounded-lg p-6 shadow-[inset_0_0_0_0.5px_var(--ink-6)] md:p-8"}>
      <Who name={name} us={us} className="text-[15px] font-medium" />
      <dl className="mt-6 flex flex-col text-[13px] leading-5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-6 border-t-[0.5px] border-rule py-3">
            <dt className="shrink-0 text-ink-10">{label}</dt>
            <dd className="text-right text-ink-12 [&>span]:justify-end">
              <Value value={value} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Pick({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-[15px] font-medium text-ink-12">{title}</p>
      <ul className="mt-4 flex flex-col gap-3">
        {items.map((i) => (
          <li key={i} className="flex gap-2.5 text-[13px] leading-5 text-ink-11">
            <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-10" />
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function ComparePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const competitor = competitorsData.competitors[slug as Slug];
  const copy = compareCopy[slug];
  if (!competitor || !copy) notFound();

  const others = Object.values(competitorsData.competitors).filter((c) => c.slug !== slug);
  const features: FeatureCategory[] = competitorsData.features;
  const glanceRows = features
    .flatMap((c) => c.items)
    .filter((i) => glance.includes(i.name))
    .map((i) => [i.name, i.openinary, i.competitors[slug] ?? false] as const);

  return (
    <SiteShell>
      <PageHero
        title={
          <>
            Openinary vs {competitor.name}.
            <br /> {copy.question}
          </>
        }
        lede={`${competitor.name} and Openinary both serve media from URLs. Here is where they differ, what each costs, and when to pick the other one.`}
        location={`compare_${slug}_hero`}
        secondary={
          slug === "cloudinary"
            ? { href: `${DOCS_URL}/migrate-from-cloudinary`, label: "Migration guide" }
            : { href: DOCS_URL, label: "Read the docs" }
        }
      />

      <Container>
        <div className="grid gap-3 md:grid-cols-2">
          <Card name="Openinary" us rows={glanceRows.map(([l, o]) => [l, o])} />
          <Card name={competitor.name} rows={glanceRows.map(([l, , t]) => [l, t])} />
        </div>
      </Container>

      <Container className="grid gap-10 pt-20 md:grid-cols-[1fr_1.4fr] md:pt-28">
        <div>
          <H2>The difference.</H2>
          <Lede className="mt-4">{copy.difference}</Lede>
        </div>
        <div className="grid content-start gap-10 sm:grid-cols-2 md:pt-2">
          <Pick title={`Pick ${competitor.name} if`} items={copy.chooseThem} />
          <Pick title="Pick Openinary if" items={copy.chooseUs} />
        </div>
      </Container>

      <Container className="pt-20 md:pt-28">
        <H2 className="mb-10">Feature by feature.</H2>
        <ComparisonTable features={features} competitorSlug={slug} competitorName={competitor.name} />
        <p className="mt-2 max-w-[640px] text-[13px] leading-5 text-ink-10">
          What we say about {competitor.name} comes from its own site,{" "}
          <a href={competitor.website} target="_blank" rel="noopener noreferrer" className="underline decoration-ink-6 underline-offset-4 hover:text-ink-12">
            {competitor.website.replace("https://", "")}
          </a>
          . Plans and features change; if something here is out of date, tell us at{" "}
          <a href="mailto:hello@openinary.dev" className="underline decoration-ink-6 underline-offset-4 hover:text-ink-12">
            hello@openinary.dev
          </a>
          .
        </p>
      </Container>

      <Container className="pt-16">
        <p className="text-[13px] text-ink-10">Other comparisons</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {others.map((c) => (
            <li key={c.slug}>
              <Link href={`/compare/${c.slug}`} className="press inline-flex h-8 items-center rounded-full bg-tile px-3.5 text-[13px] text-ink-11 transition-colors hover:text-ink-12">
                vs {c.name}
              </Link>
            </li>
          ))}
          <li>
            <Link href="/compare" className="press inline-flex h-8 items-center rounded-full px-3.5 text-[13px] text-ink-11 underline decoration-ink-6 underline-offset-4 hover:text-ink-12">
              All comparisons
            </Link>
          </li>
        </ul>
      </Container>

      <FaqBlock
        title="Questions, answered plainly."
        intro="Something else to weigh up? Ask on GitHub and you will hear from the people who build it."
        faqs={copy.faqs}
      />

      <FinalCta location="compare_cta" />
    </SiteShell>
  );
}
