import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import * as PricingCard from "@/components/pricing-card";
import { CheckCircle2, Server, Cloud, Building2 } from "lucide-react";
import Link from "next/link";
import { FullWidthDivider } from "@/components/ui/full-width-divider";
import { EnterpriseModal } from "@/components/enterprise-modal";

export function PricingSection() {
  return (
    <section className="w-full py-10 md:py-20">
      <div className="mx-auto mb-8 max-w-2xl px-6 text-center">
        <h2 className="text-3xl font-semibold tracking-tight lg:text-4xl mb-4">
          Free to self-host. <br /> Cloud starts free.
        </h2>
        <p className="text-muted-foreground leading-relaxed">
          No paywalled features. No vendor lock-in. Deploy on your own
          infrastructure for free, or let us run it for you. The public alpha
          is open to everyone.
        </p>
      </div>
      <div className="mx-auto grid w-full max-w-4xl gap-4 px-6 md:grid-cols-3">
        {plans.map((plan, index) => (
          <PricingCard.Card
            className={cn("w-full max-w-full", index === 1 && "md:scale-105")}
            key={plan.name}
          >
            <PricingCard.Header isPopular={index === 1}>
              <PricingCard.Plan>
                <PricingCard.PlanName>
                  {plan.icon}
                  <span>{plan.name}</span>
                </PricingCard.PlanName>
                {plan.badge && (
                  <PricingCard.Badge>{plan.badge}</PricingCard.Badge>
                )}
              </PricingCard.Plan>
              <PricingCard.Price>
                <PricingCard.MainPrice>{plan.price}</PricingCard.MainPrice>
                {plan.period && (
                  <PricingCard.Period>{plan.period}</PricingCard.Period>
                )}
                {plan.originalPrice && (
                  <PricingCard.OriginalPrice>
                    {plan.originalPrice}
                  </PricingCard.OriginalPrice>
                )}
              </PricingCard.Price>
              {plan.cta}
            </PricingCard.Header>

            <PricingCard.Body>
              <PricingCard.Description>
                {plan.description}
              </PricingCard.Description>
              <PricingCard.List>
                {plan.features.map((item) => (
                  <PricingCard.ListItem className="text-xs" key={item}>
                    <CheckCircle2
                      aria-hidden="true"
                      className="size-4 shrink-0 text-foreground"
                    />
                    <span>{item}</span>
                  </PricingCard.ListItem>
                ))}
              </PricingCard.List>
            </PricingCard.Body>
          </PricingCard.Card>
        ))}
      </div>
      <FullWidthDivider position="bottom" />
    </section>
  );
}

const plans = [
  {
    icon: <Server />,
    name: "Self-hosted",
    price: "Free",
    originalPrice: undefined,
    badge: undefined,
    description:
      "Run Openinary on your own infrastructure. Full control, no lock-in.",
    features: [
      "All features included",
      "Docker-based setup in 5 minutes",
      "Works with any S3-compatible storage",
      "Image & video transformations via URL",
      "Upload API + media browser UI",
      "Cloudinary-compatible syntax",
      "AGPL 3.0 license",
    ],
    cta: (
      <Button
        asChild
        variant="outline"
        className="w-full font-semibold"
        data-track-event="quickstart_clicked"
        data-track-prop-location="pricing"
      >
        <Link href="https://docs.openinary.dev/quickstart" target="_blank">
          Self-host with Docker
        </Link>
      </Button>
    ),
  },
  {
    icon: <Cloud />,
    name: "Cloud",
    price: "Free",
    period: undefined,
    originalPrice: "$20/mo",
    badge: "Public alpha",
    description:
      "We handle the hosting. Free plan included, pay as you go when you outgrow it.",
    features: [
      "Managed infrastructure & updates",
      "Free: 1 GB storage, 500 transformations / mo",
      "15 min video, 25,000 CDN requests / mo",
      "Pay-as-you-go plan to go past the free tier",
      "Bring your own S3 bucket (coming soon)",
      "Analytics dashboard",
      "Priority support",
    ],
    cta: (
      <Button
        asChild
        className="w-full font-semibold"
        data-track-event="cloud_waitlist_clicked"
        data-track-prop-location="pricing"
      >
        <Link href="https://app.openinary.dev">Start free</Link>
      </Button>
    ),
  },
  {
    icon: <Building2 />,
    name: "Enterprise",
    price: "Custom",
    period: undefined,
    originalPrice: undefined,
    badge: undefined,
    description:
      "Tailored for large-scale deployments. Ideal for teams migrating from Cloudinary.",
    features: [
      "Everything in Cloud",
      "Dedicated infrastructure",
      "Volume pricing & custom contracts",
      "SLA guarantees",
      "Onboarding & migration support",
      "Dedicated account manager",
      "Custom integrations",
    ],
    cta: (
      <EnterpriseModal
        trigger={
          <Button
            variant="outline"
            className="w-full font-semibold"
            data-track-event="enterprise_contact_clicked"
            data-track-prop-location="pricing"
          >
            Contact us
          </Button>
        }
      />
    ),
  },
];
