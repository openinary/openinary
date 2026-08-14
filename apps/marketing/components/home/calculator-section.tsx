import { Calculator } from "@/components/home/calculator/calculator";
import { Section, SectionHeader, gutter } from "@/components/home/section";

export function CalculatorSection() {
  return (
    <Section>
      <SectionHeader
        eyebrow="What it really costs"
        title="See what open source saves you"
      />
      <div className={`${gutter} pb-14 pt-10 md:pb-20`}>
        <Calculator />
      </div>
    </Section>
  );
}
