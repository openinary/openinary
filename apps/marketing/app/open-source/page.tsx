import { CHANGELOG_MDX, GITHUB_CONTRIBUTORS } from "@/lib/generated/sources";
import type { Metadata } from "next";
import { SolarFolder } from "@/components/site/solar";

import { GitHubMark } from "@/components/site/header";
import { FinalCta, PageHero, SiteShell, SkyStage, SplitHeading } from "@/components/site/shell";
import { ButtonLink, Container, DOCS_URL, GITHUB_URL, H2, InfoTile, Window } from "@/components/site/ui";

export const metadata: Metadata = {
  title: "Open source | Openinary",
  description:
    "Openinary is open source under the AGPL-3.0: the engine, the dashboard, the CLI and the hosted version, in one repository on GitHub.",
  alternates: { canonical: "/open-source" },
};

const tree = [
  { path: "apps/api", note: "The engine: uploads, transforms, delivery" },
  { path: "apps/web", note: "The self-hosted dashboard" },
  { path: "apps/cloud", note: "Openinary Cloud, the hosted version" },
  { path: "apps/docs", note: "openinary.dev/docs" },
  { path: "apps/marketing", note: "This website" },
  { path: "packages/core", note: "Transform and storage services" },
  { path: "packages/cli", note: "create-openinary" },
  { path: "packages/ui", note: "Shared interface components" },
];

const CORE_TEAM = new Set(["openinary", "florianheysen"]);

/** People with commits on GitHub (fetched at build), plus anyone thanked in the changelog. */
function contributors(): string[] {
  const thanked = [...CHANGELOG_MDX.matchAll(/\]\(https:\/\/github\.com\/([A-Za-z0-9-]+)\)/g)].map((m) => m[1]);
  const seen = new Set<string>();
  return [...GITHUB_CONTRIBUTORS, ...thanked].filter((u) => {
    const key = u.toLowerCase();
    if (CORE_TEAM.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function OpenSourcePage() {
  const people = contributors();
  return (
    <SiteShell>
      <PageHero
        title={
          <>
            Open source.
            <br /> All of it.
          </>
        }
        lede="The engine, the dashboard, the CLI and the hosted version live in one public repository under the AGPL-3.0. Nothing is held back for a paid tier."
        location="open_source_hero"
        actions={
          <div className="mt-7 flex flex-wrap gap-2">
            <ButtonLink href={`${GITHUB_URL}/blob/main/CONTRIBUTING.md`} variant="secondary">
              How to contribute
            </ButtonLink>
            <ButtonLink href={GITHUB_URL} data-track-event="github_star_clicked" data-track-prop-location="open_source_hero">
              <GitHubMark /> Star on GitHub
            </ButtonLink>
          </div>
        }
      />

      <SkyStage tone="ocean">
        <Window className="mx-auto max-w-[720px]">
          <div className="flex h-10 items-center gap-2 border-b-[0.5px] border-rule px-4 text-[12px] text-ink-12">
            <GitHubMark className="size-3.5" />
            openinary / openinary
            <span className="ml-auto rounded-full bg-chip px-2 py-0.5 text-[10px] text-ink-11">AGPL-3.0</span>
          </div>
          <ul className="divide-y-[0.5px] divide-rule">
            {tree.map((t) => (
              <li key={t.path} className="flex items-center gap-3 px-4 py-2.5 text-[12px]">
                <SolarFolder aria-hidden className="size-3.5 shrink-0 text-info" />
                <span className="w-[130px] shrink-0 font-mono text-ink-12">{t.path}</span>
                <span className="truncate text-ink-10">{t.note}</span>
              </li>
            ))}
          </ul>
        </Window>
      </SkyStage>

      <Container className="pt-20 md:pt-28">
        <SplitHeading
          title="One licence."
          muted="Same code on Cloud and on your server."
          aside="The AGPL-3.0 lets you run, read, change and share Openinary. If you offer a modified version as a service, you share your changes too."
        />
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          <InfoTile title="Read the licence" body="The full AGPL-3.0 text, at the root of the repository." href={`${GITHUB_URL}/blob/main/LICENSE`} />
          <InfoTile title="Contributor agreement" body="Every pull request is signed off under the project's CLA, once per contributor." href={`${GITHUB_URL}/blob/main/CLA.md`} />
          <InfoTile title="Run it locally" body="Clone, install and start the whole stack on your machine." href={`${DOCS_URL}/local-development`} />
        </div>
      </Container>

      <Container className="pt-20 md:pt-28">
        <SplitHeading
          title="Built in the open."
          muted="With help."
          aside="Features and fixes in recent releases came from people outside the core team. Thank you."
        />
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {people.map((u) => (
            <li key={u}>
              <a
                href={`https://github.com/${u}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-lg bg-tile p-3 transition-colors hover:bg-surface-top"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`https://github.com/${u}.png?size=64`} alt="" width={32} height={32} className="size-8 rounded-full bg-ink-3" />
                <span className="truncate text-[13px] text-ink-12">{u}</span>
              </a>
            </li>
          ))}
        </ul>
      </Container>

      <Container className="pt-20 md:pt-28">
        <H2 muted="Pick one.">Ways to help.</H2>
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          <InfoTile title="Report a bug" body="Steps to reproduce and what you expected. That's most of the fix." href={`${GITHUB_URL}/issues/new/choose`} />
          <InfoTile title="Ask or suggest" body="Questions, ideas and show and tell, in GitHub Discussions." href={`${GITHUB_URL}/discussions`} />
          <InfoTile title="Send a pull request" body="Small and focused is easiest to merge. The guide covers setup." href={`${GITHUB_URL}/blob/main/CONTRIBUTING.md`} />
        </div>
      </Container>

      <div className="pt-16" />
      <FinalCta location="open_source_cta" />
    </SiteShell>
  );
}
