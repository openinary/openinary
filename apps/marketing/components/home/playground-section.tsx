import { Playground } from "@/components/home/playground/playground";
import { Section, SectionHeader } from "@/components/home/section";

export function PlaygroundSection() {
  return (
    <Section>
      <SectionHeader
        eyebrow="Playground"
        title="Drop the uploader into your stack"
      />
      {/* Full bleed to the column edges, like the feature grid and the docs
          row: the page's own side borders close the box. */}
      <div className="mt-11">
        <Playground />
      </div>
    </Section>
  );
}
