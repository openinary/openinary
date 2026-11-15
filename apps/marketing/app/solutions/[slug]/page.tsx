import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TerminalMock } from "@/components/site/mocks";
import { FinalCta, PageHero, SiteShell, SkyStage } from "@/components/site/shell";
import { solutionBySlug, solutions } from "@/components/site/solutions-data";
import { CheckList, Container, H2, InfoTile, ShotTile, Sky, TextLink } from "@/components/site/ui";

export function generateStaticParams() {
  return solutions.map(({ slug }) => ({ slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const s = solutionBySlug((await params).slug);
  if (!s) return {};
  return {
    title: `${s.metaTitle} | Openinary`,
    description: s.metaDescription,
    alternates: { canonical: `/solutions/${s.slug}` },
  };
}

export default async function SolutionPage({ params }: { params: Promise<{ slug: string }> }) {
  const s = solutionBySlug((await params).slug);
  if (!s) notFound();

  return (
    <SiteShell>
      <PageHero title={s.title} lede={s.lede} location={`solution_${s.slug}_hero`} />

      <SkyStage tone={s.heroTone}>{s.hero}</SkyStage>

      <Container className="pt-20 md:pt-28">
        <H2 muted={s.section.muted}>{s.section.title}</H2>
        <ul className="mt-12 grid gap-3 md:grid-cols-2">
          {s.cards.map((c) => (
            <ShotTile key={c.title} tone={c.tone} shot={c.shot} title={c.title} muted={c.muted} body={c.body}>
              <CheckList items={c.checks} className="mt-5" />
            </ShotTile>
          ))}
        </ul>
      </Container>

      <Container className="pt-20 md:pt-28">
        <div className="grid items-center gap-10 rounded-lg bg-tile p-6 md:grid-cols-[1fr_1.3fr] md:p-12">
          <div>
            <H2 muted={s.hood.muted}>{s.hood.title}</H2>
            <p className="mt-4 max-w-[380px] text-[13px] leading-5 text-ink-11">{s.hood.body}</p>
            <div className="mt-6 flex flex-col items-start gap-2">
              {s.hood.links.map((l) => (
                <TextLink key={l.href} href={l.href}>
                  {l.label}
                </TextLink>
              ))}
            </div>
          </div>
          <Sky tone="dusk" className="rounded-lg p-4 md:p-6">
            <TerminalMock title={s.hood.terminal.title} lines={s.hood.terminal.lines} />
          </Sky>
        </div>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {s.specs.map((spec) => (
            <li key={spec.title}>
              <InfoTile title={spec.title} body={spec.body} className="h-full" />
            </li>
          ))}
        </ul>
      </Container>

      <div className="pt-16" />
      <FinalCta location={`solution_${s.slug}_cta`} title={s.cta.title} body={s.cta.body} />
    </SiteShell>
  );
}
