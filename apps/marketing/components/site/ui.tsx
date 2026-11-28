import Link from "next/link";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The site's primitives, in the serveros.com idiom: a 1200px column, 36px
 * controls with a hairline ring, light display type at -0.04em, and 20px
 * tiles that hold a product shot over a sky.
 */

import { APP_URL, DOCS_URL, REPO_URL as GITHUB_URL } from "@/lib/site";

export { APP_URL, DOCS_URL, GITHUB_URL };

export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-page";

export function Container({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("mx-auto w-full max-w-[1248px] px-5 md:px-6", className)}
      {...props}
    />
  );
}

const buttonBase = `inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3.5 text-[13px] font-medium leading-5 tracking-[-0.01em] press ${focusRing}`;

const buttonVariants = {
  primary: "bg-brand text-white shadow-[0_0_0_1px_var(--primary-ring)] hover:bg-brand-strong",
  secondary: "bg-control text-ink-12 ring-raised hover:bg-control-hover",
  ghost: "text-ink-11 hover:text-ink-12",
} as const;

export type ButtonVariant = keyof typeof buttonVariants;

export function buttonClass(variant: ButtonVariant = "primary", className?: string) {
  return cn(buttonBase, buttonVariants[variant], className);
}

/** Links that leave the site open in a new tab, everything else stays. */
function external(href: string) {
  return /^https?:/.test(href)
    ? { target: "_blank", rel: "noopener noreferrer" }
    : {};
}

export function ButtonLink({
  href,
  variant = "primary",
  className,
  ...props
}: Omit<React.ComponentProps<typeof Link>, "href"> & {
  href: string;
  variant?: ButtonVariant;
}) {
  return (
    <Link
      href={href}
      {...external(href)}
      className={buttonClass(variant, className)}
      {...props}
    />
  );
}

/** The pair every hero and closing block ends on. */
export function StartButtons({
  location,
  secondary = { href: DOCS_URL, label: "Read the docs" },
  className,
}: {
  location: string;
  secondary?: { href: string; label: string; event?: string };
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <ButtonLink
        href={secondary.href}
        variant="secondary"
        data-track-event={secondary.event ?? "docs_clicked"}
        data-track-prop-location={location}
      >
        {secondary.label}
      </ButtonLink>
      <ButtonLink
        href={APP_URL}
        data-track-event="cloud_cta_clicked"
        data-track-prop-location={location}
      >
        Start free
      </ButtonLink>
    </div>
  );
}

/** Underlined text link, the quiet way out of a block. */
export function TextLink({
  href,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Link>, "href"> & { href: string }) {
  return (
    <Link
      href={href}
      {...external(href)}
      className={cn(
        "rounded-[3px] text-[13px] font-medium text-ink-12 underline decoration-ink-6 underline-offset-4 transition-colors hover:decoration-ink-11",
        focusRing,
        className,
      )}
      {...props}
    />
  );
}

export function H1({ className, ...props }: React.ComponentProps<"h1">) {
  return (
    <h1
      className={cn(
        "text-balance text-[36px] font-medium leading-[40px] tracking-[-0.03em] text-ink-12 md:text-[48px] md:leading-[52px]",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Section heading. `muted` is a second sentence in the same line, the
 * reference's two-tone headings ("From a repo to a live site. Then it keeps
 * itself running.").
 */
export function H2({
  className,
  muted,
  children,
  ...props
}: React.ComponentProps<"h2"> & { muted?: React.ReactNode }) {
  return (
    <h2
      className={cn(
        "max-w-[620px] text-balance text-[28px] font-medium leading-8 tracking-[-0.03em] text-ink-12 md:text-[38px] md:leading-[42px]",
        className,
      )}
      {...props}
    >
      {children}
      {muted ? <> {muted}</> : null}
    </h2>
  );
}

export function H3({
  className,
  muted,
  children,
  ...props
}: React.ComponentProps<"h3"> & { muted?: React.ReactNode }) {
  return (
    <h3
      className={cn(
        "text-[20px] font-normal leading-7 tracking-[-0.02em] text-ink-12",
        className,
      )}
      {...props}
    >
      {children}
      {muted ? <> {muted}</> : null}
    </h3>
  );
}

export function Lede({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "max-w-[680px] text-balance text-[15px] leading-6 text-ink-11",
        className,
      )}
      {...props}
    />
  );
}

export function Body({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p className={cn("text-[13px] leading-5 text-ink-11", className)} {...props} />
  );
}

/** Small rounded label next to a title: "Free", "Open source", "Feature". */
export function Pill({
  className,
  tone = "neutral",
  ...props
}: React.ComponentProps<"span"> & { tone?: "neutral" | "green" | "amber" | "red" }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium leading-none",
        tone === "neutral" && "bg-ink-3 text-ink-11 ring-raised",
        tone === "green" && "bg-ok-bg text-ok shadow-[0_0_0_0.5px_var(--ok-ring)]",
        tone === "amber" && "bg-warn-bg text-warn shadow-[0_0_0_0.5px_var(--warn-ring)]",
        tone === "red" && "bg-bad-bg text-bad shadow-[0_0_0_0.5px_var(--bad-ring)]",
        className,
      )}
      {...props}
    />
  );
}

export function CheckList({
  items,
  className,
}: {
  items: React.ReactNode[];
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-col gap-2 text-[13px] leading-5 text-ink-11", className)}>
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-ink-12" aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export type SkyTone = "dawn" | "clear" | "haze" | "dusk" | "ocean";

/** A painted sky, the backdrop every product shot sits on. */
export function Sky({
  tone = "clear",
  className,
  ...props
}: React.ComponentProps<"div"> & { tone?: SkyTone }) {
  return <div className={cn("sky", `sky-${tone}`, className)} {...props} />;
}

/**
 * The glassy window a product shot floats in: a translucent rim around a dark
 * pane, so the sky shows through the edge.
 */
export function Window({
  className,
  innerClassName,
  children,
}: {
  className?: string;
  innerClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "shot-rim",
        className,
      )}
    >
      <div
        className={cn(
          "overflow-hidden rounded-[16px] bg-frame text-ink-12",
          innerClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Feature tile: the copy, then a sky with a shot cropped into it. The shot is
 * anchored to the bottom and runs off the edge, like a window seen through a
 * frame.
 */
export function ShotTile({
  tone,
  shot,
  title,
  muted,
  body,
  children,
  shotClassName,
  className,
}: {
  tone: SkyTone;
  shot: React.ReactNode;
  title: string;
  muted?: string;
  body: React.ReactNode;
  children?: React.ReactNode;
  shotClassName?: string;
  className?: string;
}) {
  return (
    <li className={cn("flex min-w-0 flex-col overflow-hidden rounded-lg shadow-[inset_0_0_0_0.5px_var(--ink-6)]", className)}>
      <div className="flex flex-1 flex-col px-5 pt-5 pb-6">
        <H3 muted={muted}>{title}</H3>
        <Body className="mt-2">{body}</Body>
        {children}
      </div>
      <Sky
        tone={tone}
        className={cn(
          "relative h-[260px] overflow-hidden border-t-[0.5px] border-ink-6 md:h-[280px]",
          shotClassName,
        )}
      >
        <div className="shot-cut absolute inset-x-6 top-8 bottom-0 md:inset-x-8">{shot}</div>
      </Sky>
    </li>
  );
}

/** A plain tile: title and a line, optionally a link out. */
export function InfoTile({
  title,
  body,
  href,
  badge,
  className,
}: {
  title: string;
  body: React.ReactNode;
  href?: string;
  badge?: string;
  className?: string;
}) {
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="flex flex-wrap items-center gap-2 text-[14px] font-medium leading-5 text-ink-12">
          {title}
          {badge ? <Pill>{badge}</Pill> : null}
        </span>
        {href ? (
          <span aria-hidden className="text-ink-10 transition-colors group-hover:text-ink-12">
            ↗
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-[13px] leading-5 text-ink-11">{body}</p>
    </>
  );
  const cls = cn(
    "group block rounded-lg bg-tile p-4 transition-colors",
    href && "hover:bg-surface-top",
    className,
  );
  return href ? (
    <Link href={href} {...external(href)} className={cn(cls, focusRing)}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
