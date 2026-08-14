"use client";

import Link from "next/link";

import Logo from "@/components/logo";
import { useGitHubStars } from "@/hooks/use-github-stars";
import { gutter } from "@/components/home/section";
import { CtaLink, focusRing, pressable } from "@/components/home/cta-button";
import { cn } from "@/lib/utils";

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
          className={cn(
            "-ml-1 rounded-md border border-transparent p-1 transition-all hover:bg-muted",
            focusRing,
            pressable,
          )}
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
            className={cn(
              "rounded-sm text-sm font-medium text-muted-foreground transition-all hover:text-foreground",
              focusRing,
              pressable,
            )}
          >
            Docs
          </Link>

          <Link
            href="https://github.com/openinary/openinary"
            target="_blank"
            rel="noopener noreferrer"
            data-track-event="github_star_clicked"
            data-track-prop-location="header"
            className={cn(
              "flex items-center gap-1.5 rounded-sm text-sm font-medium text-muted-foreground transition-all hover:text-foreground",
              focusRing,
              pressable,
            )}
          >
            <GitHubMark />
            <span className="hidden sm:inline">GitHub</span>
            {starCount !== null && starCount !== undefined ? (
              <span className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums sm:inline">
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

/**
 * The solid GitHub mark, exported from the Figma frame. Lucide only ships an
 * outlined octocat, which reads as a different logo at 20px next to the filled
 * one in the mockup.
 */
function GitHubMark() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className="size-5 shrink-0"
    >
      <path d="M12 2C10.6868 2 9.38642 2.25866 8.17317 2.7612C6.95991 3.26375 5.85752 4.00035 4.92893 4.92893C3.05357 6.8043 2 9.34784 2 12C2 16.42 4.87 20.17 8.84 21.5C9.34 21.58 9.5 21.27 9.5 21V19.31C6.73 19.91 6.14 17.97 6.14 17.97C5.68 16.81 5.03 16.5 5.03 16.5C4.12 15.88 5.1 15.9 5.1 15.9C6.1 15.97 6.63 16.93 6.63 16.93C7.5 18.45 8.97 18 9.54 17.76C9.63 17.11 9.89 16.67 10.17 16.42C7.95 16.17 5.62 15.31 5.62 11.5C5.62 10.39 6 9.5 6.65 8.79C6.55 8.54 6.2 7.5 6.75 6.15C6.75 6.15 7.59 5.88 9.5 7.17C10.29 6.95 11.15 6.84 12 6.84C12.85 6.84 13.71 6.95 14.5 7.17C16.41 5.88 17.25 6.15 17.25 6.15C17.8 7.5 17.45 8.54 17.35 8.79C18 9.5 18.38 10.39 18.38 11.5C18.38 15.32 16.04 16.16 13.81 16.41C14.17 16.72 14.5 17.33 14.5 18.26V21C14.5 21.27 14.66 21.59 15.17 21.5C19.14 20.16 22 16.42 22 12C22 10.6868 21.7413 9.38642 21.2388 8.17317C20.7362 6.95991 19.9997 5.85752 19.0711 4.92893C18.1425 4.00035 17.0401 3.26375 15.8268 2.7612C14.6136 2.25866 13.3132 2 12 2Z" />
    </svg>
  );
}
