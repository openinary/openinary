import Link from "next/link";
import { Plus } from "lucide-react";

import { GitHubMark, SiteHeader } from "@/components/site/header";
import { Mark } from "@/components/site/mark";
import { footerColumns, legalLinks } from "@/components/site/nav";
import { ThemeToggle } from "@/components/site/theme-toggle";
import {
  Container,
  GITHUB_URL,
  H1,
  H2,
  Lede,
  Sky,
  StartButtons,
  ButtonLink,
  focusRing,
  type SkyTone,
} from "@/components/site/ui";
import { cn } from "@/lib/utils";

/** Header, page, footer: every public page goes through this. */
export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-[60] focus-visible:rounded-md focus-visible:bg-ink-12 focus-visible:px-3 focus-visible:py-2 focus-visible:text-[13px] focus-visible:text-page"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </>
  );
}

/** Left-aligned page opener: title, a line or two, two buttons, an optional note. */
export function PageHero({
  title,
  lede,
  location,
  secondary,
  note,
  eyebrow,
  actions,
}: {
  title: React.ReactNode;
  lede: React.ReactNode;
  location: string;
  secondary?: { href: string; label: string; event?: string };
  note?: React.ReactNode;
  /** A small line above the title. */
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <Container className="flex flex-col pt-16 pb-12 md:pt-28 md:pb-14">
      {eyebrow ? <div className="mb-5 text-[13px] text-ink-10">{eyebrow}</div> : null}
      <H1 className="max-w-[900px] md:text-[68px] md:leading-[1.02]">{title}</H1>
      <Lede className="mt-4">{lede}</Lede>
      {actions ?? (
        <StartButtons location={location} secondary={secondary} className="mt-7" />
      )}
      {note ? <div className="mt-5 text-[13px] text-ink-10">{note}</div> : null}
    </Container>
  );
}

/** A full-width sky band holding the page's main shot. */
export function SkyStage({
  tone = "dawn",
  children,
  className,
}: {
  tone?: SkyTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Container>
      <Sky tone={tone} className={cn("rounded-lg px-4 py-10 md:px-16 md:py-14", className)}>
        {children}
      </Sky>
    </Container>
  );
}

/** Heading on the left, a sentence and actions on the right. */
export function SplitHeading({
  title,
  muted,
  aside,
  children,
  className,
}: {
  title: React.ReactNode;
  muted?: React.ReactNode;
  aside?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid items-end gap-6 md:grid-cols-2", className)}>
      <H2 muted={muted}>{title}</H2>
      {aside || children ? (
        <div className="flex flex-col gap-4 md:items-end md:pb-1">
          {aside ? <p className="max-w-[420px] text-[13px] leading-5 text-ink-11">{aside}</p> : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}

export type Faq = { question: string; answer: React.ReactNode };

/** Questions on the right, the heading and a way to ask on the left. */
export function FaqBlock({
  title,
  intro,
  faqs,
}: {
  title: React.ReactNode;
  intro: React.ReactNode;
  faqs: Faq[];
}) {
  return (
    <Container className="grid gap-10 py-16 md:grid-cols-[1fr_1.3fr] md:py-24">
      <div>
        <H2>{title}</H2>
        <p className="mt-4 max-w-[340px] text-[13px] leading-5 text-ink-11">{intro}</p>
        <ButtonLink
          href={`${GITHUB_URL}/discussions`}
          variant="secondary"
          className="mt-6"
          data-track-event="github_discussions_clicked"
          data-track-prop-location="faq"
        >
          <GitHubMark />
          Ask on GitHub
        </ButtonLink>
      </div>
      <div>
        {faqs.map(({ question, answer }, i) => (
          <details
            key={question}
            open={i === 0}
            className="group border-b-[0.5px] border-ink-4"
          >
            <summary
              className={cn(
                "flex cursor-pointer list-none items-center justify-between gap-4 rounded-sm py-4 text-[15px] leading-6 text-ink-12 [&::-webkit-details-marker]:hidden",
                focusRing,
              )}
            >
              <h3>{question}</h3>
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-ink-3 text-ink-11 ring-raised">
                <Plus aria-hidden className="size-3 transition-transform group-open:rotate-45" />
              </span>
            </summary>
            <div className="max-w-[560px] pb-5 text-[13px] leading-5 text-ink-11 [&_a]:text-ink-12 [&_a]:underline [&_a]:decoration-ink-6 [&_a]:underline-offset-4 [&_code]:font-mono [&_code]:text-[12px] [&_code]:text-ink-12">
              {answer}
            </div>
          </details>
        ))}
      </div>
    </Container>
  );
}

/** The closing block: heading and line on the left, the two buttons on the right. */
export function FinalCta({
  location,
  title = "Keep your media where you trust it.",
  body = "Free plan, no card required. Pay as you go past the free quota, or run it yourself, the engine is the same.",
}: {
  location: string;
  title?: string;
  body?: string;
}) {
  return (
    <Container className="pt-8 pb-16 md:pb-24">
      <div className="grid gap-8 rounded-lg bg-tile px-6 py-12 md:grid-cols-[1fr_auto] md:items-end md:px-14 md:py-16">
        <div>
          <H2>{title}</H2>
          <p className="mt-3 max-w-[440px] text-[15px] leading-6 text-ink-11">{body}</p>
        </div>
        <StartButtons location={location} />
      </div>
    </Container>
  );
}

export function SiteFooter() {
  return (
    <footer>
      <Container className="grid gap-10 pt-10 pb-12 md:grid-cols-[1fr_2fr]">
        <Link href="/" aria-label="Openinary home" className="flex h-fit items-center gap-2 text-[15px] font-medium tracking-[-0.02em]">
          <Mark className="size-[17px] text-brand" />
          Openinary
        </Link>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {footerColumns.map((col) => (
            <div key={col.title}>
              <p className="text-[13px] font-medium text-ink-12">{col.title}</p>
              <ul className="mt-3 flex flex-col gap-2">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      {...(/^https?:/.test(l.href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      className="text-[13px] text-ink-10 transition-colors hover:text-ink-12"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Container>
      <Container className="flex flex-col gap-4 border-t-[0.5px] border-ink-4 py-5 text-[12px] text-ink-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span>© {new Date().getFullYear()} Openinary</span>
          {legalLinks.map((l) => (
            <Link key={l.href} href={l.href} className="transition-colors hover:text-ink-12">
              {l.label}
            </Link>
          ))}
          <span>AGPL-3.0</span>
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <Link href={GITHUB_URL} target="_blank" rel="noopener noreferrer" aria-label="Openinary on GitHub" className="w-fit transition-colors hover:text-ink-12">
            <GitHubMark />
          </Link>
        </div>
      </Container>
    </footer>
  );
}
