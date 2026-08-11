import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Section, H2, P, Ul, A } from "@/components/legal";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | Openinary",
  description:
    "The terms that govern your use of the Openinary Cloud service, billing, acceptable use, and account termination.",
};

export default function TermsPage() {
  return (
    <div className="bg-background overflow-x-clip">
      <div className="relative mx-auto max-w-screen-xl border-x">
        <Header />
        <main className="mx-auto max-w-4xl px-4 py-12 md:px-6 md:py-20 min-h-[80vh] [&_strong]:font-semibold">
          <div className="mb-12">
            <h1 className="text-3xl font-semibold tracking-tight lg:text-4xl mb-4">
              Terms of Service
            </h1>
            <p className="text-muted-foreground max-w-[600px] leading-relaxed">
              Last updated July 24, 2026. These terms govern your use of the Openinary Cloud
              service.
            </p>
          </div>

          <Section>
            <H2>1. Scope of these terms</H2>
            <P>
              These terms form a binding agreement between you and Florian Heysen, an individual
              based in France operating Openinary (&ldquo;we&rdquo;, &ldquo;us&rdquo;), and they
              cover the <strong>managed Openinary Cloud service</strong> only: the hosted
              application, the media storage and delivery infrastructure, the transformation API,
              and the dashboard.
            </P>
            <P>
              If you run Openinary on your own infrastructure, these terms do{" "}
              <strong>not</strong> apply to you. Self-hosting is governed solely by the{" "}
              <A href="https://github.com/openinary/openinary/blob/main/LICENSE">
                AGPL 3.0 license
              </A>{" "}
              and we provide no service, warranty or support obligation for it under this
              agreement.
            </P>
            <P>
              By creating an account or using the Cloud service, you accept these terms. If you are
              using Openinary on behalf of a company, you confirm you are authorised to bind that
              company.
            </P>
          </Section>

          <Section>
            <H2>2. The service and its current status</H2>
            <P>
              Openinary Cloud is currently offered as a <strong>public alpha</strong>. Features,
              limits and pricing may change while the service matures, and we will give reasonable
              notice of changes that materially affect you.
            </P>
            <P>
              The Cloud plan is provided without a service level agreement. Uptime commitments,
              dedicated infrastructure and contractual guarantees are available only under an
              Enterprise agreement, which is signed separately and prevails over these terms where
              the two conflict.
            </P>
          </Section>

          <Section>
            <H2>3. Your account</H2>
            <Ul>
              <li>You must be at least 16 years old to create an account</li>
              <li>The information you give us must be accurate and kept up to date</li>
              <li>
                You are responsible for everything that happens under your account, including
                actions performed with your API keys
              </li>
              <li>
                Keep your credentials and API keys confidential. Tell us at{" "}
                <A href="mailto:security@openinary.dev">security@openinary.dev</A> as soon as you
                suspect unauthorised access
              </li>
              <li>
                Do not create multiple accounts to work around quotas, free allowances or a
                suspension
              </li>
            </Ul>
          </Section>

          <Section>
            <H2>4. Your content</H2>
            <P>
              You keep all rights to the images, videos and other files you upload. We claim no
              ownership over them.
            </P>
            <P>
              You grant us a worldwide, non-exclusive, royalty-free licence to host, store, cache,
              encode, resize, transform and deliver your files, strictly for the purpose of
              operating the service for you. This licence exists only to make the product work, it
              ends when you delete the content or close your account, and it does not allow us to
              use your content for marketing, training or any other purpose.
            </P>
            <P>
              You confirm that you own or have the necessary rights to every file you upload and
              deliver through Openinary, and that doing so does not infringe anyone else&apos;s
              rights.
            </P>
          </Section>

          <Section>
            <H2>5. Acceptable use</H2>
            <P>You must not use Openinary to store, transform or deliver:</P>
            <Ul>
              <li>Content that is illegal under French or European law</li>
              <li>
                Child sexual abuse material, which we report to the competent authorities without
                notice
              </li>
              <li>
                Content that infringes copyright, trademarks, privacy or any other third party
                right
              </li>
              <li>Malware, phishing pages, or files designed to exploit a vulnerability</li>
              <li>
                Content promoting hate, harassment or violence against a person or a group of
                people
              </li>
            </Ul>
            <P>You must also not:</P>
            <Ul>
              <li>
                Use the delivery layer as an <strong>open proxy or hotlinking service</strong> for
                media you do not control
              </li>
              <li>
                Circumvent quotas, rate limits, billing meters or any technical restriction of the
                service
              </li>
              <li>
                Resell raw storage, bandwidth or transformation capacity as a standalone product
                competing with Openinary
              </li>
              <li>
                Load-test, scrape or otherwise place a burden on the infrastructure that degrades
                the service for other customers, unless we have agreed to it in writing
              </li>
              <li>Attempt to gain unauthorised access to the systems or the data of other users</li>
            </Ul>
          </Section>

          <Section>
            <H2>6. Reporting content and takedown</H2>
            <P>
              We act as a hosting provider within the meaning of article 6 of the French LCEN and
              of the European Digital Services Act. We do not monitor the files our users upload,
              and we are not responsible for them, but we remove content that is manifestly illegal
              once we are properly notified.
            </P>
            <P>
              To report content, email{" "}
              <A href="mailto:abuse@openinary.dev">abuse@openinary.dev</A> with the exact URLs
              concerned, the reason the content is unlawful or infringing, your contact details,
              and, for a copyright claim, a statement that you are the rights holder or authorised
              to act for them. We review reports promptly, and we notify the affected user unless
              the law prevents us from doing so.
            </P>
            <P>
              If your content has been removed and you believe the report was wrong, you can contest
              the decision at the same address.
            </P>
          </Section>

          <Section>
            <H2>7. Plans, billing and usage</H2>
            <Ul>
              <li>
                The Cloud plan is billed at a fixed monthly fee that includes a monthly quota of
                storage, transformations and bandwidth
              </li>
              <li>
                Usage above the included quota is billed on a pay as you go basis, at the rates
                shown on our pricing page at the time the usage happens
              </li>
              <li>
                Usage is measured by our systems, and those measurements are what we bill on. If you
                think a measurement is wrong, contact us and we will look into it
              </li>
              <li>
                Payments are processed by Stripe, with subscriptions managed through Autumn. We
                never see or store your full card details
              </li>
              <li>
                Prices are shown excluding VAT unless stated otherwise. VAT is applied where
                required by law, based on your billing country and, for businesses, your VAT number
              </li>
              <li>
                Subscription fees are non-refundable except where the law requires otherwise, in
                particular under section 8 below
              </li>
              <li>
                If a payment fails, we will retry and notify you. If the balance remains unpaid
                after 14 days, we may suspend the service until it is settled
              </li>
              <li>
                We may change our prices, with at least 30 days notice by email. Changes take effect
                at your next renewal, and you can cancel before then if you disagree
              </li>
            </Ul>
          </Section>

          <Section>
            <H2>8. Right of withdrawal (consumers in the EU)</H2>
            <P>
              If you are a consumer in the European Union, you normally have 14 days to withdraw
              from a distance contract without giving a reason.
            </P>
            <P>
              Because the service is made available to you immediately, by subscribing you expressly
              ask us to begin performance during the withdrawal period and you acknowledge that you
              lose your right of withdrawal once the service has been fully performed. If you
              withdraw while the service is only partly performed, you owe an amount proportionate
              to what was delivered before you told us. To withdraw, email{" "}
              <A href="mailto:legal@openinary.dev">legal@openinary.dev</A>.
            </P>
          </Section>

          <Section>
            <H2>9. Cancellation, suspension and data after termination</H2>
            <P>
              You can cancel at any time from your dashboard. Cancellation takes effect at the end
              of the period you have already paid for, and any usage above quota accrued before then
              remains due.
            </P>
            <P>
              We may suspend or terminate your account if you materially breach these terms, if your
              use puts the infrastructure or other customers at risk, if payment remains outstanding,
              or if we are legally required to. For serious breaches, in particular illegal content,
              suspension can be immediate and without notice.
            </P>
            <P>
              After your account is closed, you have <strong>30 days</strong> to export your media
              through the API or the dashboard. After that window we permanently delete your files
              and account data, except for the billing records we are required to keep. See our{" "}
              <A href="/privacy">Privacy Policy</A> for the full retention detail.
            </P>
            <P>
              We may also discontinue the Cloud service entirely. In that case we will give you at
              least 60 days notice, a way to export your data, and a refund of any prepaid fees
              covering the period after the shutdown.
            </P>
          </Section>

          <Section>
            <H2>10. Availability and support</H2>
            <P>
              We work to keep Openinary available and fast, but the Cloud plan is provided on a best
              effort basis. Planned maintenance is announced in advance where possible, and
              emergency maintenance may happen without notice.
            </P>
            <P>
              Cloud subscribers get priority support by email at{" "}
              <A href="mailto:support@openinary.dev">support@openinary.dev</A>. We aim to answer
              quickly but do not commit to a response time outside an Enterprise agreement.
            </P>
          </Section>

          <Section>
            <H2>11. Warranties and liability</H2>
            <P>
              The service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. To the
              extent permitted by law, we exclude all implied warranties, including fitness for a
              particular purpose and uninterrupted or error-free operation.
            </P>
            <P>
              To the extent permitted by law, our total liability arising out of or related to the
              service is capped at the amount you paid us in the 12 months preceding the event that
              gave rise to the claim. We are not liable for indirect or consequential damage,
              including lost profits, lost revenue, or lost or corrupted data.
            </P>
            <P>
              You remain responsible for keeping your own backups of the media you consider
              critical.
            </P>
            <P>
              None of this limits liability that cannot be limited by law, including our liability
              for gross negligence, wilful misconduct, or death and personal injury, and none of it
              affects the statutory rights of consumers, in particular the legal guarantee of
              conformity.
            </P>
            <P>
              You agree to indemnify us against third party claims arising from the content you
              upload or deliver through the service, or from your breach of these terms.
            </P>
          </Section>

          <Section>
            <H2>12. Open source and trademarks</H2>
            <P>
              The Openinary software is and stays open source under the AGPL 3.0. Nothing in these
              terms restricts the rights that licence grants you over the code, and nothing in these
              terms applies to your own self-hosted instance.
            </P>
            <P>
              The Openinary name and logo are not covered by that licence. You may refer to
              Openinary factually, for example to say that your product is built on it, but you may
              not use our name or logo in a way that suggests we endorse or operate your service.
            </P>
          </Section>

          <Section>
            <H2>13. Privacy</H2>
            <P>
              How we handle personal data, which processors we rely on, and what rights you have are
              described in our <A href="/privacy">Privacy Policy</A>, which forms part of this
              agreement. If you process personal data through Openinary as a controller, we act as
              your processor for that data.
            </P>
          </Section>

          <Section>
            <H2>14. Changes to these terms</H2>
            <P>
              We may update these terms as the service evolves. For material changes we will notify
              account holders by email at least 30 days in advance. Continuing to use the service
              after a change takes effect means you accept the new terms, and if you do not, you can
              cancel before that date.
            </P>
          </Section>

          <Section>
            <H2>15. Governing law and disputes</H2>
            <P>
              These terms are governed by French law. If you are a consumer, this does not deprive
              you of the protection of the mandatory rules of the country where you live.
            </P>
            <P>
              We would rather solve any problem directly, so please write to us first. Consumers in
              the EU may also use the consumer mediation process or the European{" "}
              <A href="https://ec.europa.eu/consumers/odr">
                Online Dispute Resolution platform
              </A>
              . Failing an amicable settlement, disputes with business customers fall under the
              exclusive jurisdiction of the French courts.
            </P>
          </Section>

          <Section>
            <H2>16. Contact</H2>
            <P>
              Openinary is operated by Florian Heysen, an individual based in France. For anything
              related to these terms, contact{" "}
              <A href="mailto:legal@openinary.dev">legal@openinary.dev</A>.
            </P>
          </Section>
        </main>
        <Footer />
      </div>
    </div>
  );
}
