import { Cta } from "@/components/home/cta";
import { Docs } from "@/components/home/docs";
import { Faq } from "@/components/home/faq";
import { Footer } from "@/components/home/footer";
import { Header } from "@/components/home/header";
import { Hero } from "@/components/home/hero";
import { PlaceholderSection } from "@/components/home/placeholder-section";
import { ProductPreview } from "@/components/home/product-preview";
import { Why } from "@/components/home/why";

export default function Home() {
  return (
    <div className="bg-background">
      <div className="mx-auto w-full max-w-[1100px] md:border-x md:border-border">
        <Header />
        <main>
          <Hero />
          <ProductPreview />
          <Why />
          <PlaceholderSection
            eyebrow="Playground"
            title="Drop the uploader into your stack"
            label="[playground]"
          />
          <Docs />
          <PlaceholderSection
            eyebrow="What it really costs"
            title="See what open source saves you"
            label="[openinary vs cloudinary calculator]"
          />
          <Cta />
          <Faq />
        </main>
        <Footer />
      </div>
    </div>
  );
}
