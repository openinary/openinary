import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Section, H2, P, Ul, A } from "@/components/legal";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Legal Notice | Openinary",
  description:
    "Publisher, hosting provider and registration details for the Openinary website and Cloud service.",
};

export default function LegalNoticePage() {
  return (
    <div className="bg-background overflow-x-clip">
      <div className="relative mx-auto max-w-screen-xl border-x">
        <Header />
        <main className="mx-auto max-w-4xl px-4 py-12 md:px-6 md:py-20 min-h-[80vh] [&_strong]:font-semibold">
          <div className="mb-12">
            <h1 className="text-3xl font-semibold tracking-tight lg:text-4xl mb-4">
              Legal Notice
            </h1>
            <p className="text-muted-foreground max-w-[600px] leading-relaxed">
              Last updated July 24, 2026. Publisher and hosting information for openinary.dev,
              published under article 6 of the French LCEN.
            </p>
          </div>

          <Section>
            <H2>1. Publisher</H2>
            <P>
              The openinary.dev website and the Openinary Cloud service are published by{" "}
              <strong>Florian Heysen</strong>, an individual entrepreneur based in France, reachable
              at <A href="mailto:legal@openinary.dev">legal@openinary.dev</A>.
            </P>
          </Section>

          <Section>
            <H2>2. Director of publication</H2>
            <P>Florian Heysen, as publisher of the website.</P>
          </Section>

          <Section>
            <H2>3. Hosting providers</H2>
            <P>The website and the Cloud service run on the following infrastructure:</P>
            <Ul>
              <li>
                <strong>Cloudflare, Inc.</strong> - application hosting, media storage and content
                delivery. 101 Townsend Street, San Francisco, CA 94107, United States.{" "}
                <A href="https://www.cloudflare.com">www.cloudflare.com</A>
              </li>
              <li>
                <strong>Neon, Inc.</strong> - managed database hosting. 209 Orange Street,
                Wilmington, DE 19801, United States. <A href="https://neon.com">neon.com</A>
              </li>
            </Ul>
          </Section>

          <Section>
            <H2>4. Contact</H2>
            <P>
              For anything legal or contractual, write to{" "}
              <A href="mailto:legal@openinary.dev">legal@openinary.dev</A>. To report illegal or
              infringing content hosted on the service, use{" "}
              <A href="mailto:abuse@openinary.dev">abuse@openinary.dev</A>, following the procedure
              described in section 6 of our <A href="/terms">Terms of Service</A>. For anything
              about personal data, use <A href="mailto:privacy@openinary.dev">privacy@openinary.dev</A>.
            </P>
          </Section>

          <Section>
            <H2>5. Intellectual property</H2>
            <P>
              The Openinary software is open source and distributed under the{" "}
              <A href="https://github.com/openinary/openinary/blob/main/LICENSE">AGPL 3.0 license</A>
              . The content of this website, including its texts, illustrations and layout, and the
              Openinary name and logo, remain the property of their respective owners and are not
              covered by that license.
            </P>
          </Section>

          <Section>
            <H2>6. User content and hosting status</H2>
            <P>
              For the media uploaded by users of the Cloud service, we act as a hosting provider
              within the meaning of article 6 of the LCEN. We do not monitor that content and we are
              not responsible for it, but we remove manifestly illegal content once properly
              notified. See section 6 of our <A href="/terms">Terms of Service</A> for the reporting
              procedure.
            </P>
          </Section>

          <Section>
            <H2>7. Personal data and cookies</H2>
            <P>
              How we collect, use and protect personal data, which processors we rely on, and what
              rights you have are described in our <A href="/privacy">Privacy Policy</A>.
            </P>
          </Section>

          <Section>
            <H2>8. Consumer mediation</H2>
            <P>
              If you are a consumer and a dispute with us cannot be resolved directly, you may refer
              the matter free of charge to a consumer mediator, or use the European{" "}
              <A href="https://ec.europa.eu/consumers/odr">Online Dispute Resolution platform</A>.
            </P>
          </Section>
        </main>
        <Footer />
      </div>
    </div>
  );
}
