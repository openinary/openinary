import { CtaLink } from "@/components/site/cta-button";
import { CopyCommand } from "@/components/home/copy-command";
import { Section, SectionHeader, gutter } from "@/components/site/section";
import { APP_URL } from "@/lib/site";

/** `location` lands in the analytics event, so each page names its own. */
export function Cta({ location = "footer_cta" }: { location?: string }) {
  return (
    <Section>
      <SectionHeader
        eyebrow="Try Openinary now"
        title="Keep your media in an environment you trust."
      />
      <div className={`${gutter} flex flex-wrap items-center gap-x-5 gap-y-3 pb-14 pt-8 md:pb-20`}>
        <CtaLink
          href={APP_URL}
          target="_blank"
          rel="noopener noreferrer"
          data-track-event="cloud_cta_clicked"
          data-track-prop-location={location}
        >
          Try Cloud Now
        </CtaLink>
        <CopyCommand command="npx create-openinary@latest" />
      </div>
    </Section>
  );
}
