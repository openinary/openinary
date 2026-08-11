import Link from "next/link";
import { ArrowRight, BookOpen, Layers, Rocket, Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PerspectiveBook,
  BookHeader,
  BookTitle,
  BookDescription,
} from "@/components/perspective-book";
import { FullWidthDivider } from "@/components/ui/full-width-divider";

const docs = [
  {
    href: "https://docs.openinary.dev/quickstart",
    icon: <Rocket className="size-4" />,
    label: "Get started",
    title: "Quickstart",
    description:
      "Set up Openinary and serve your first optimized image in under five minutes.",
    color: "bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100",
    accent: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  },
  {
    href: "https://docs.openinary.dev/media-transformations/overview",
    icon: <Layers className="size-4" />,
    label: "Transformations",
    title: "Media Transformations",
    description:
      "Resize, crop, convert, and optimize media on the fly — straight from the URL.",
    color: "bg-sky-100 text-sky-950 dark:bg-sky-950 dark:text-sky-100",
    accent: "bg-sky-500/20 text-sky-700 dark:text-sky-300",
  },
  {
    href: "https://docs.openinary.dev/guides/coolify-deployment",
    icon: <BookOpen className="size-4" />,
    label: "Guide",
    title: "Coolify Deployment",
    description:
      "Self-host Openinary on your own infrastructure with Coolify in a few steps.",
    color: "bg-violet-100 text-violet-950 dark:bg-violet-950 dark:text-violet-100",
    accent: "bg-violet-500/20 text-violet-700 dark:text-violet-300",
  },
];

export function DocsSection() {
  return (
    <section className="relative w-full py-10 md:py-20">
      <FullWidthDivider position="top" />

      <div className="mx-auto w-full max-w-5xl px-6">
        <div className="mb-10 md:mb-14">
          <p className="text-muted-foreground mb-2 text-sm font-medium uppercase tracking-widest">
            Documentation
          </p>
          <h2 className="text-balance text-3xl font-semibold tracking-tight lg:text-4xl">
            Everything you need to get started
          </h2>
          <p className="text-muted-foreground mt-4 max-w-xl leading-relaxed">
            From your first deployment to advanced media transformations — our
            docs cover every step.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {docs.map((doc) => (
            <Link
              key={doc.href}
              href={doc.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col items-center gap-6 rounded-xl border border-border bg-card p-6 transition-colors hover:border-foreground/20 hover:bg-muted/50"
            >
              <PerspectiveBook size="default" className={doc.color}>
                <BookHeader>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${doc.accent}`}
                  >
                    {doc.icon}
                    {doc.label}
                  </span>
                </BookHeader>
                <BookTitle className="text-base">{doc.title}</BookTitle>
                <BookDescription>{doc.description}</BookDescription>
              </PerspectiveBook>

              <div className="flex w-full items-center justify-between">
                <span className="text-sm font-medium">{doc.title}</span>
                <ArrowRight className="text-muted-foreground size-4 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>
        <div className="mt-8 flex flex-col items-start gap-3 border-t border-border pt-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Github className="text-muted-foreground size-5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Something missing?</p>
              <p className="text-muted-foreground text-sm">
                Can&apos;t find what you&apos;re looking for in the docs.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link
              href="https://github.com/openinary/openinary/issues/new"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open an issue
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      <FullWidthDivider position="bottom" />
    </section>
  );
}
