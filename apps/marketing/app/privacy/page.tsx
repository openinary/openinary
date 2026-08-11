import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Section, H2, P, Ul, A } from "@/components/legal";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Openinary",
  description: "Learn how Openinary collects, uses, and protects your personal data.",
};

export default function PrivacyPage() {
  return (
    <div className="bg-background overflow-x-clip">
      <div className="relative mx-auto max-w-screen-xl border-x">
        <Header />
        <main className="mx-auto max-w-4xl px-4 py-12 md:px-6 md:py-20 min-h-[80vh] [&_strong]:font-semibold">
          <div className="mb-12">
            <h1 className="text-3xl font-semibold tracking-tight lg:text-4xl mb-4">
              Privacy Policy
            </h1>
            <p className="text-muted-foreground max-w-[600px] leading-relaxed">
              Last updated July 24, 2026. Learn how Openinary collects, uses, and protects your data.
            </p>
          </div>

          <Section>
            <H2>1. Who we are</H2>
            <P>
              Openinary is an open-source media platform operated by Florian Heysen, an
              individual based in France, who is the data controller responsible for your personal
              data. The software is developed in the open with the help of a community of
              contributors - you can see everyone who has contributed on{" "}
              <A href="https://github.com/openinary/openinary/graphs/contributors?all=1">
                GitHub
              </A>. For any privacy-related inquiry, contact us at{" "}
              <A href="mailto:privacy@openinary.dev">privacy@openinary.dev</A>.
            </P>
          </Section>

          <Section>
            <H2>2. Data we collect</H2>
            <P>
              <strong>When you use our website.</strong> We measure how the site is used with{" "}
              PostHog (EU-hosted). We collect:
            </P>
            <Ul>
              <li><strong>Usage data</strong> - pages viewed and a small number of specific button clicks (e.g. opening the cloud app, contacting sales)</li>
              <li><strong>Technical data</strong> - browser type and version, operating system, device type, screen size, referring page, and web performance metrics</li>
              <li><strong>Approximate location</strong> - country, region and city derived from your IP address. Your IP address is anonymized on collection and is not stored by our analytics</li>
              <li><strong>Session recordings</strong> - replays of your interactions on the site (mouse movement, clicks, scrolling and pages viewed), captured with input fields masked</li>
            </Ul>
            <P>
              We do <strong>not</strong> use blanket autocapture - we do not automatically log every
              click or keystroke, only the events listed above.
            </P>
            <P>
              <strong>When you have an account (Cloud service).</strong> To provide the managed
              service we collect:
            </P>
            <Ul>
              <li><strong>Account information</strong> - your name, email address, and a securely hashed password. If you sign in with Google, we receive your basic Google profile (name, email, avatar) instead</li>
              <li><strong>Authentication data</strong> - login sessions, API keys, and the IP address and user agent tied to each session, used to keep your account secure</li>
              <li><strong>Media files</strong> - the images and videos you upload for storage and transformation</li>
              <li><strong>Usage &amp; billing data</strong> - storage used, transformations and requests performed, and the billing details needed to manage your subscription</li>
            </Ul>
          </Section>

          <Section>
            <H2>3. Legal basis for processing</H2>
            <P>Under the GDPR, we rely on the following legal bases:</P>
            <Ul>
              <li><strong>Performance of a contract</strong> (Art. 6(1)(b)) - creating your account, authenticating you, storing and transforming your media, and running your subscription</li>
              <li><strong>Legitimate interests</strong> (Art. 6(1)(f)) - keeping the service secure, preventing fraud and abuse, enforcing rate limits, and understanding and improving how the product is used</li>
              <li><strong>Consent</strong> (Art. 6(1)(a)) - analytics and session-recording cookies, where consent is required. You can withdraw consent at any time</li>
              <li><strong>Legal obligation</strong> (Art. 6(1)(c)) - retaining invoices and accounting records as required by law</li>
            </Ul>
          </Section>

          <Section>
            <H2>4. How long we keep your data</H2>
            <Ul>
              <li><strong>Account data</strong> - for as long as your account is active, then deleted on request or after account closure</li>
              <li><strong>Media files</strong> - until you delete them or close your account</li>
              <li><strong>Session recordings</strong> - 30 days, then automatically deleted</li>
              <li><strong>Website analytics events</strong> - retained by PostHog on our behalf, then automatically deleted</li>
              <li><strong>Billing &amp; invoicing records</strong> - kept for up to 10 years to meet French accounting and tax obligations</li>
            </Ul>
          </Section>

          <Section>
            <H2>5. Cookies</H2>
            <P>
              Our Cloud app uses <strong>strictly necessary cookies</strong> to keep you signed in -
              these are required for the service to work. Our website uses PostHog, which sets
              <strong> first-party analytics cookies</strong> and local storage to measure usage and
              record sessions.
            </P>
            <P>We do not use advertising or third-party marketing cookies, and we do not sell your data.</P>
          </Section>

          <Section>
            <H2>6. Third parties</H2>
            <P>
              We share data only with the processors needed to run the service, each bound by a data
              processing agreement:
            </P>
            <Ul>
              <li><strong>Cloudflare</strong> - server hosting (Workers), media storage (R2), content delivery and DDoS protection</li>
              <li><strong>Neon</strong> - managed database hosting for account and usage data</li>
              <li><strong>PostHog</strong> - product analytics and session replay (EU hosted)</li>
              <li><strong>Autumn &amp; Stripe</strong> - subscription management and payment processing</li>
              <li><strong>Google</strong> - sign-in, only if you choose to log in with Google</li>
              <li><strong>Attio</strong> - customer relationship management, including waitlist and contact requests</li>
            </Ul>
          </Section>

          <Section>
            <H2>7. International data transfers</H2>
            <P>
              Some of our processors (for example Stripe, Autumn, Google, Cloudflare and Attio) may
              process data outside the European Economic Area, including in the United States. Where
              that happens, transfers are protected by appropriate safeguards such as the European
              Commission&rsquo;s Standard Contractual Clauses or an adequacy decision.
            </P>
          </Section>

          <Section>
            <H2>8. Data security</H2>
            <P>
              We protect your data with encryption in transit (HTTPS), hashed passwords, scoped API
              keys, and access controls that limit who and what can reach your data. No system is
              perfectly secure, but we take reasonable measures appropriate to the risk.
            </P>
          </Section>

          <Section>
            <H2>9. Your rights (GDPR)</H2>
            <P>As a user in the EU/EEA, you have the right to:</P>
            <Ul>
              <li>Access your personal data</li>
              <li>Rectify inaccurate data</li>
              <li>Request erasure of your data</li>
              <li>Restrict or object to processing</li>
              <li>Data portability</li>
              <li>Withdraw consent at any time, without affecting prior processing</li>
            </Ul>
            <P>
              We do not use automated decision-making or profiling that produces legal effects about
              you. To exercise any of these rights, email us at{" "}
              <A href="mailto:privacy@openinary.dev">privacy@openinary.dev</A>; we aim to respond
              within one month.
            </P>
            <P>
              If you believe we have mishandled your data, you have the right to lodge a complaint
              with your local supervisory authority. In France, this is the CNIL (
              <A href="https://www.cnil.fr">www.cnil.fr</A>).
            </P>
          </Section>

          <Section>
            <H2>10. Children</H2>
            <P>
              Openinary is not directed at children and is not intended for anyone under 16. We do
              not knowingly collect personal data from children.
            </P>
          </Section>

          <Section>
            <H2>11. Changes to this policy</H2>
            <P>
              We may update this policy as the service evolves. Material changes will be reflected by
              the &ldquo;Last updated&rdquo; date at the top of this page.
            </P>
          </Section>
        </main>
        <Footer />
      </div>
    </div>
  );
}
