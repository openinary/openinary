import type { Metadata } from "next";

import { CalculatorSection } from "@/components/home/calculator-section";
import { Cta } from "@/components/home/cta";
import { Docs } from "@/components/home/docs";
import { Faq, faqs } from "@/components/home/faq";
import { Footer } from "@/components/home/footer";
import { Header } from "@/components/home/header";
import { Hero } from "@/components/home/hero";
import { PlaygroundSection } from "@/components/home/playground-section";
import { ProductPreview } from "@/components/home/product-preview";
import { Why } from "@/components/home/why";
import { freeQuotas } from "@/lib/pricing";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const site = "https://openinary.dev";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${site}/#organization`,
      name: "Openinary",
      url: site,
      logo: `${site}/logo.svg`,
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
      "@id": `${site}/#website`,
      name: "Openinary",
      url: site,
      publisher: { "@id": `${site}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      name: "Openinary",
      url: site,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Linux, macOS, Windows (Docker)",
      license: "https://www.gnu.org/licenses/agpl-3.0.html",
      publisher: { "@id": `${site}/#organization` },
      offers: {
        "@type": "Offer",
        name: "Openinary Cloud free plan",
        price: "0",
        priceCurrency: "USD",
        url: "https://app.openinary.dev",
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
    <div className="bg-background">
      <script
        type="application/ld+json"
        // Escape "<" so no string in the data can close the script tag.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <div className="mx-auto w-full max-w-[1100px] md:border-x md:border-border">
        <Header />
        <main id="main">
          <Hero />
          <ProductPreview />
          <Why />
          <PlaygroundSection />
          <Docs />
          <CalculatorSection />
          <Faq />
          <Cta />
        </main>
        <Footer />
      </div>
    </div>
  );
}
