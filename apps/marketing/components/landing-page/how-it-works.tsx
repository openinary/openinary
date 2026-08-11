import { Button } from "@/components/ui/button";
import Link from "next/link";

const steps = [
  {
    number: "1",
    title: "Docker Pull & Run",
    description: "Get started with two simple commands",
  },
  {
    number: "2",
    title: "Upload your assets",
    description: "Through the API or the UI",
  },
  {
    number: "3",
    title: "Transform your assets",
    description: "They are now optimized for the web!",
  },
];

export default function HowItWorksSection() {
  return (
    <section className="px-6 py-16 md:py-20 border-y">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4 text-center mx-auto max-w-3xl">
          <h2 className="text-3xl font-semibold tracking-tight lg:text-4xl mb-4">
            How it works in 3 steps
          </h2>
          <p className="text-muted-foreground max-w-[600px] mx-auto leading-relaxed">
            Get up and running with Openinary in minutes. No complex setup
            required.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {steps.map((step) => (
            <div
              key={step.number}
              className="flex flex-col gap-4 p-6 border rounded-lg"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-8 w-8 items-center justify-center bg-primary text-primary-foreground text-sm font-bold">
                  {step.number}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-lg font-semibold">{step.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-start">
          <Button
            asChild
            size="lg"
            variant="link"
            data-track-event="quickstart_clicked"
            data-track-prop-location="how-it-works"
          >
            <Link
              href="https://docs.openinary.dev/quickstart"
              target="_blank"
              rel="noopener noreferrer"
            >
              See full Quickstart
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
