import { CalculatorSection } from "@/components/home/calculator-section";
import { Cta } from "@/components/home/cta";
import { Docs } from "@/components/home/docs";
import { Faq } from "@/components/home/faq";
import { Footer } from "@/components/home/footer";
import { Header } from "@/components/home/header";
import { Hero } from "@/components/home/hero";
import { PlaygroundSection } from "@/components/home/playground-section";
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
