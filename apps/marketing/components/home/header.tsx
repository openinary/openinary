"use client";

import Link from "next/link";
import { Github } from "lucide-react";

import Logo from "@/components/logo";
import { useGitHubStars } from "@/hooks/use-github-stars";
import { gutter } from "@/components/home/section";
import { CtaLink } from "@/components/home/cta-button";

export function Header() {
  const { starCount } = useGitHubStars("openinary", "openinary");

  return (
    <header className={gutter}>
      <nav className="flex h-16 items-center justify-between gap-4">
        <Link
          href="/"
          aria-label="Openinary home"
          data-track-event="logo_clicked"
          data-track-prop-location="header"
          className="-ml-1 rounded-md p-1 transition-colors hover:bg-muted"
        >
          <Logo />
        </Link>

        <div className="flex items-center gap-4 md:gap-8">
          <Link
            href="https://docs.openinary.dev/"
            target="_blank"
            rel="noopener noreferrer"
            data-track-event="docs_clicked"
            data-track-prop-location="header"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Docs
          </Link>

          <Link
            href="https://github.com/openinary/openinary"
            target="_blank"
            rel="noopener noreferrer"
            data-track-event="github_star_clicked"
            data-track-prop-location="header"
            className="group flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Github className="size-5" aria-hidden />
            <span className="hidden sm:inline">GitHub</span>
            {starCount !== null && starCount !== undefined ? (
              <span className="hidden rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums sm:inline">
                {starCount}
              </span>
            ) : null}
          </Link>

          <CtaLink
            href="https://app.openinary.dev"
            target="_blank"
            rel="noopener noreferrer"
            size="sm"
            data-track-event="cloud_cta_clicked"
            data-track-prop-location="header"
          >
            Try Cloud
          </CtaLink>
        </div>
      </nav>
    </header>
  );
}
