import { Calculator } from "@/components/home/calculator/calculator";
import { Section, SectionHeader } from "@/components/home/section";

export function CalculatorSection() {
  return (
    <Section>
      <SectionHeader
        eyebrow="What it really costs"
        title="See what open source saves you"
      />
      {/* Full bleed to the column edges, like the feature grid and the docs
          row: the page's own side borders close the box. */}
      <div className="mt-11">
        <Calculator />
      </div>
    </Section>
  );
}
