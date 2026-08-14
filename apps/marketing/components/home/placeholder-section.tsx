import { Section, SectionHeader } from "@/components/home/section";

/**
 * Slot for a section whose interactive piece is not built yet. Matches the grey
 * blocks in the Figma frame so the page reads at full height while the
 * playground and the pricing calculator are designed.
 */
export function PlaceholderSection({
  eyebrow,
  title,
  label,
  minHeight = "min-h-[320px] md:min-h-[480px]",
}: {
  eyebrow: string;
  title: React.ReactNode;
  label: string;
  minHeight?: string;
}) {
  return (
    <Section>
      <SectionHeader eyebrow={eyebrow} title={title} />
      <div
        className={`mt-11 flex items-center justify-center bg-muted px-6 py-16 ${minHeight}`}
      >
        <p className="text-center text-xl font-semibold tracking-[-0.025em] text-muted-foreground sm:text-2xl">
          {label}
        </p>
      </div>
    </Section>
  );
}
