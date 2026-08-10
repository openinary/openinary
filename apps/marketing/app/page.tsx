import Banner from "@/components/landing-page/banner";
import FAQsSection from "@/components/landing-page/faq";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { HeroSection } from "@/components/hero";
import { FeatureSection } from "@/components/feature-section";
import { PricingSection } from "@/components/pricing-section";
import { Integrations } from "@/components/integrations";
import DeveloperSection from "@/components/features-6";
import { DocsSection } from "@/components/docs-section";
import CTASection from "@/components/landing-page/cta";
import { SectionReveal } from "@/components/ui/section-reveal";

export default function Home() {
  return (
    <div className="bg-background overflow-x-clip">
      <main className="relative mx-auto max-w-screen-xl border-x">
        <Banner
          title="Openinary Cloud is in public alpha."
          description="Start on the free plan, no card required."
          linkText="Try it"
          linkUrl="https://app.openinary.dev"
        />
        <Header />
        <SectionReveal>
          <HeroSection />
        </SectionReveal>
        <SectionReveal delay={0.1}>
          <FeatureSection />
        </SectionReveal>
        <SectionReveal delay={0.1}>
          <Integrations />
        </SectionReveal>
        <SectionReveal delay={0.1}>
          <DeveloperSection />
        </SectionReveal>
        <SectionReveal delay={0.1}>
          <DocsSection />
        </SectionReveal>
        <SectionReveal delay={0.1}>
          <PricingSection />
        </SectionReveal>
        <SectionReveal delay={0.1}>
          <FAQsSection />
        </SectionReveal>
        <CTASection />
        <Footer />
      </main>
    </div>
  );
}
