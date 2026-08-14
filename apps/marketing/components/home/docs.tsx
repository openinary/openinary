import Link from "next/link";
import { BookOpen, Layers, Rocket, Server } from "lucide-react";

import {
  BookDescription,
  BookHeader,
  BookTitle,
  PerspectiveBook,
} from "@/components/perspective-book";
import { Section, SectionHeader } from "@/components/home/section";
import { focusRing } from "@/components/home/cta-button";
import { cn } from "@/lib/utils";

const docs = [
  {
    href: "https://docs.openinary.dev/quickstart",
    tint: "bg-gradient-to-br from-emerald-100 to-emerald-200/80 text-emerald-950 dark:from-emerald-900 dark:to-emerald-950 dark:text-emerald-50",
    icon: Rocket,
    label: "Get started",
    title: "Quickstart",
    description:
      "Set up Openinary and serve your first optimized image in under five minutes.",
  },
  {
    href: "https://docs.openinary.dev/media-transformations/overview",
    tint: "bg-gradient-to-br from-sky-100 to-sky-200/80 text-sky-950 dark:from-sky-900 dark:to-sky-950 dark:text-sky-50",
    icon: Layers,
    label: "Transformations",
    title: "Transformations",
    description:
      "Resize, crop, convert and optimize media on the fly, straight from the URL.",
  },
  {
    href: "https://docs.openinary.dev/configuration/storage",
    tint: "bg-gradient-to-br from-rose-100 to-rose-200/80 text-rose-950 dark:from-rose-900 dark:to-rose-950 dark:text-rose-50",
    icon: Server,
    label: "Configuration",
    title: "Your storage",
    description:
      "Point Openinary at the S3, R2 or MinIO bucket you already run.",
  },
  {
    href: "https://docs.openinary.dev/guides/coolify-deployment",
    tint: "bg-gradient-to-br from-violet-100 to-violet-200/80 text-violet-950 dark:from-violet-900 dark:to-violet-950 dark:text-violet-50",
    icon: BookOpen,
    label: "Guide",
    title: "Self-hosting",
    description:
      "Deploy Openinary on your own infrastructure with Docker or Coolify.",
  },
];

export function Docs() {
  return (
    <Section>
      <SectionHeader
        eyebrow="Documentation"
        title="Everything you need to get started"
      />

      <ul className="mt-11 grid border-t border-border sm:grid-cols-2 lg:grid-cols-4">
        {docs.map(({ href, tint, icon: Icon, label, title, description }) => (
          <li
            key={href}
            className="flex justify-center border-b border-border px-6 py-9 sm:[&:nth-child(odd)]:border-r lg:border-b-0 lg:[&:not(:last-child)]:border-r"
          >
            <Link
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              data-track-event="docs_clicked"
              data-track-prop-location="docs_section"
              aria-label={`${title}. ${description}`}
              className={cn("rounded-lg", focusRing)}
            >
              <PerspectiveBook className={tint}>
                <BookHeader>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-black/5 px-2 py-1 text-xs font-medium dark:bg-white/10">
                    <Icon className="size-3.5" aria-hidden />
                    {label}
                  </span>
                </BookHeader>
                <BookTitle className="text-base">{title}</BookTitle>
                <BookDescription>{description}</BookDescription>
              </PerspectiveBook>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
