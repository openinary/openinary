import type { Metadata } from "next";

import { CalculatorSection } from "@/components/home/calculator-section";
import { Cta } from "@/components/home/cta";
import { Docs } from "@/components/home/docs";
import { Faq, faqs } from "@/components/home/faq";
import { Hero } from "@/components/home/hero";
import { PlaygroundSection } from "@/components/home/playground-section";
import { ProductPreview } from "@/components/home/product-preview";
import { Why } from "@/components/home/why";
import { PageShell } from "@/components/site/page-shell";
import { freeQuotas } from "@/lib/pricing";
import { APP_URL, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "Openinary",
      url: SITE_URL,
      logo: `${SITE_URL}/logo.svg`,
      sameAs: [
        "https://github.com/openinary",
        "https://openalternative.co/openinary",
        "https://www.npmjs.com/package/create-openinary",
      ],
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: "support@openinary.dev",
      },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "Openinary",
      url: SITE_URL,
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      name: "Openinary",
      url: SITE_URL,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Linux, macOS, Windows (Docker)",
      license: "https://www.gnu.org/licenses/agpl-3.0.html",
      publisher: { "@id": `${SITE_URL}/#organization` },
      offers: {
        "@type": "Offer",
        name: "Openinary Cloud free plan",
        price: "0",
        priceCurrency: "USD",
        url: APP_URL,
        description: `${freeQuotas.storageGb} GB of storage, ${freeQuotas.transformations.toLocaleString("en-US")} image transformations, ${freeQuotas.videoMinutes} minutes of video processing and ${freeQuotas.cdnRequests.toLocaleString("en-US")} CDN requests per month, no credit card required. Pay as you go beyond that.`,
      },
    },
    {
      "@type": "FAQPage",
      mainEntity: faqs.map(({ question, answer, text }) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: text ?? (answer as string) },
      })),
    },
  ],
};

export default function Home() {
  return (
    <PageShell>
      <script
        type="application/ld+json"
        // Escape "<" so no string in the data can close the script tag.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <Hero />
      <ProductPreview />
      <Why />
      <PlaygroundSection />
      <Docs />
      <CalculatorSection />
      <Faq />
      <Cta />
    </PageShell>
  );
}
