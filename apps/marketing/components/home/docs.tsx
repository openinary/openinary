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
    icon: Rocket,
    label: "Get started",
    title: "Quickstart",
    description:
      "Set up Openinary and serve your first optimized image in under five minutes.",
  },
  {
    href: "https://docs.openinary.dev/media-transformations/overview",
    icon: Layers,
    label: "Transformations",
    title: "Transformations",
    description:
      "Resize, crop, convert and optimize media on the fly, straight from the URL.",
  },
  {
    href: "https://docs.openinary.dev/configuration/storage",
    icon: Server,
    label: "Configuration",
    title: "Your storage",
    description:
      "Point Openinary at the S3, R2 or MinIO bucket you already run.",
  },
  {
    href: "https://docs.openinary.dev/guides/coolify-deployment",
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
        {docs.map(({ href, icon: Icon, label, title, description }) => (
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
              <PerspectiveBook className="bg-card text-card-foreground">
                <BookHeader>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
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
