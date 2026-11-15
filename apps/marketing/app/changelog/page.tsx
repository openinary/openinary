import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";

import { ChangelogList, type Entry } from "@/app/changelog/changelog-list";
import { PageHero, SiteShell } from "@/components/site/shell";
import { ButtonLink, Container, GITHUB_URL } from "@/components/site/ui";

export const metadata: Metadata = {
  title: "Changelog | Openinary",
  description: "New features, improvements and fixes in Openinary, written up the day they ship.",
  alternates: { canonical: "/changelog" },
};

/**
 * The docs' changelog is the source: each <Update> block there becomes an
 * entry here, read at build time, so the two can never disagree.
 */
function readEntries(): Entry[] {
  const src = readFileSync(join(process.cwd(), "../docs/changelog.mdx"), "utf8");
  const re = /<Update label="([^"]+)" description="([^"]+)" tags=\{\[([^\]]*)\]\}>([\s\S]*?)<\/Update>/g;
  return [...src.matchAll(re)].map(([, date, version, tags, body]) => ({
    date,
    version,
    tags: [...tags.matchAll(/"([^"]+)"/g)].map((m) => m[1]),
    body: body.trim(),
  }));
}

export default function ChangelogPage() {
  const entries = readEntries();
  return (
    <SiteShell>
      <PageHero
        title="What's new in Openinary. As it ships."
        lede="New features, improvements and fixes, written up the day they go out."
        location="changelog_hero"
        actions={
          <div className="mt-7 flex flex-wrap gap-2">
            <ButtonLink href={`${GITHUB_URL}/releases`} variant="secondary">
              GitHub releases
            </ButtonLink>
            <ButtonLink href="https://app.openinary.dev" data-track-event="cloud_cta_clicked" data-track-prop-location="changelog_hero">
              Start free
            </ButtonLink>
          </div>
        }
      />
      <Container className="max-w-[728px] pb-24">
        <ChangelogList entries={entries} />
      </Container>
    </SiteShell>
  );
}
