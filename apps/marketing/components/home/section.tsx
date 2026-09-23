import { cn } from "@/lib/utils";

/**
 * Page shell primitives shared by every homepage section.
 *
 * The Figma frame is a 1100px column with hairline side borders; sections stack
 * inside it and own their top border, so the horizontal rules always run the
 * full width of the column.
 */

export function Section({
  className,
  children,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section className={cn("border-t border-border", className)} {...props}>
      {children}
    </section>
  );
}

/** Horizontal inset used by every section: 24px on phones, 40px from md up. */
export const gutter = "px-6 md:px-10";

export function Eyebrow({
  className,
  children,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "text-[11px] font-normal uppercase leading-[1.5] tracking-[0.14em] text-muted-foreground/80",
        className,
      )}
      {...props}
    >
      {children}
    </p>
  );
}

export function SectionTitle({
  className,
  children,
  ...props
}: React.ComponentProps<"h2">) {
  return (
    <h2
      className={cn(
        "max-w-[32ch] text-balance text-xl font-semibold leading-[1.33] tracking-[-0.025em] text-foreground sm:text-2xl",
        className,
      )}
      {...props}
    >
      {children}
    </h2>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  className,
}: {
  eyebrow: string;
  title?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(gutter, "pt-14 md:pt-20", className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      {title ? <SectionTitle className="mt-3">{title}</SectionTitle> : null}
    </div>
  );
}
