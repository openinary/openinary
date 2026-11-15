import { SiteShell } from "@/components/site/shell";
import { Container, H1, Lede } from "@/components/site/ui";

/**
 * Shell for the text pages (compare, legal, terms, privacy): the site's
 * header and footer around a narrower reading column.
 */
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <SiteShell>
      <Container className="max-w-[1100px] pb-24">{children}</Container>
    </SiteShell>
  );
}

/** Page opener: a small label, the title, an optional line. `children` render above, for a back link. */
export function PageIntro({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow: string;
  title: string;
  lede?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="pt-16 pb-12 md:pt-20 md:pb-14">
      {children}
      <p className="text-[13px] text-ink-10">{eyebrow}</p>
      <H1 className="mt-3 max-w-[22ch]">{title}</H1>
      {lede ? <Lede className="mt-4">{lede}</Lede> : null}
    </div>
  );
}
