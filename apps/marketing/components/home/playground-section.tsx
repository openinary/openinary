import { Playground } from "@/components/home/playground/playground";
import { Section, SectionHeader, gutter } from "@/components/home/section";

export function PlaygroundSection() {
  return (
    <Section>
      <SectionHeader
        eyebrow="Playground"
        title="Drop the uploader into your stack"
      />
      <div className={`${gutter} pb-14 pt-10 md:pb-20`}>
        <Playground />
      </div>
    </Section>
  );
}
