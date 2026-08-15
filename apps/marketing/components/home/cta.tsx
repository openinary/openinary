import { CtaLink } from "@/components/home/cta-button";
import { CopyCommand } from "@/components/home/copy-command";
import { Section, SectionHeader, gutter } from "@/components/home/section";

export function Cta() {
  return (
    <Section>
      <SectionHeader
        eyebrow="Try Openinary now"
        title="Keep your media in an environment you trust."
      />
      <div className={`${gutter} flex flex-wrap items-center gap-x-5 gap-y-3 pb-14 pt-8 md:pb-20`}>
        <CtaLink
          href="https://app.openinary.dev"
          target="_blank"
          rel="noopener noreferrer"
          data-track-event="cloud_cta_clicked"
          data-track-prop-location="footer_cta"
        >
          Try Cloud Now
        </CtaLink>
        <CopyCommand command="npx create-openinary@latest" />
      </div>
    </Section>
  );
}
