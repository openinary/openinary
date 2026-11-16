import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";

import { TalkToUs } from "@/components/site/enterprise-form";
import { Calculator } from "@/components/home/calculator/calculator";
import pricing from "@/data/pricing.json";
import { EveryPlan, PlanCard, PlanStrip, plans, rateLines } from "@/components/site/plans";
import { FaqBlock, FinalCta, PageHero, SiteShell, SplitHeading } from "@/components/site/shell";
import { Container, DOCS_URL, Sky, StartButtons } from "@/components/site/ui";

export const metadata: Metadata = {
  title: "Pricing | Openinary",
  description:
    "Self-host Openinary for free, or let us run it: a free plan with no card, then usage at published rates. Compare your Cloudinary bill with the calculator.",
  alternates: { canonical: "/pricing" },
};

const { free, included } = pricing.openinaryCloud;
const cld = Object.fromEntries(pricing.cloudinary.plans.map((p) => [p.id, p]));
const n = (v: number) => v.toLocaleString("en-US");

type Cell = string | boolean;
const table: { group: string; sub: string; rows: [string, Cell, Cell, Cell][] }[] = [
  {
    group: "Included every month",
    sub: "Storage is cumulative, the rest resets monthly.",
    rows: [
      ["Storage", `${free.storageGb} GB`, `${included.storageGb} GB`, "Your bucket"],
      ["Image transformations", n(free.transformations), n(included.transformations), "Unlimited"],
      ["Video processing", `${free.videoMinutes} min`, `${included.videoMinutes} min`, "Unlimited"],
      ["CDN requests", n(free.cdnRequests), n(included.cdnRequests), "Unlimited"],
      ["Buckets", "1", "2", "Your choice"],
    ],
  },
  {
    group: "Past the allowance",
    sub: "Free stops with a 402 until the month resets. Cloud keeps going.",
    rows: rateLines.map((r) => [r.label, false, r.value, "Your hardware"] as [string, Cell, Cell, Cell]),
  },
  {
    group: "Delivery and API",
    sub: "Same transformation syntax everywhere.",
    rows: [
      ["URL transformations", true, true, true],
      ["Video with ready-time estimates", true, true, true],
      ["Drop-in React uploader", true, true, true],
      ["Signed delivery URLs", false, false, true],
      ["Warm the cache on upload", false, false, true],
      ["Full queue admin API", false, false, true],
    ],
  },
  {
    group: "Running it",
    sub: "Who looks after the servers.",
    rows: [
      ["Servers, storage and CDN", "We do", "We do", "You do"],
      ["Updates", "Automatic", "Automatic", "One command"],
      ["Card required", "No", "At checkout", "No"],
    ],
  },
];

const billingFaqs = [
  {
    question: "What happens when I hit the Free limits?",
    answer:
      "Requests that would go past them return 402 until the monthly allowance resets. Storage is cumulative and does not reset. Move to Cloud from Settings, Plan, to keep serving past the allowance.",
  },
  {
    question: "How is video metered?",
    answer:
      "On how long the transform ran, not on how long the video is. Cached deliveries never count as transformations, so a popular video costs one encode.",
  },
  {
    question: "Is there a monthly fee on Cloud?",
    answer:
      "No. Cloud doubles the Free allowances and bills only what goes past them, at the rates on this page. A card is collected at checkout so that usage can be billed.",
  },
  {
    question: "Can I self-host for free?",
    answer: (
      <>
        Yes. Openinary is open source under the AGPL-3.0, so you can run the engine and dashboard on your own servers
        with your own bucket. You pay your own hosting, and your own time. The{" "}
        <a href={`${DOCS_URL}/quickstart`}>quickstart</a> gets you there in one command.
      </>
    ),
  },
  {
    question: "How accurate is the calculator?",
    answer:
      "It uses public list prices and a fixed average file size to turn requests into bandwidth. It's an estimate to compare orders of magnitude, not a quote, and Openinary does not guarantee any saving.",
  },
  {
    question: "Do you offer volume pricing?",
    answer: (
      <>
        Yes, for large or steady workloads. Press Talk to us under the plans and tell us your monthly volumes; we will work out a rate.
      </>
    ),
  },
];

export default function PricingPage() {
  return (
    <SiteShell>
      <PageHero
        title={
          <>
            Outgrew Cloudinary&nbsp;Free?
            <br /> Skip the ${cld.plus.monthlyUsd} jump.
          </>
        }
        lede={`Cloudinary pools storage, bandwidth and transformations into ${cld.free.credits} free credits, then asks $${cld.plus.monthlyUsd} a month. Openinary bills each one at its own rate, with a free plan to start and no monthly fee after it. Or self-host it for free.`}
        location="pricing_hero"
        secondary={{ href: "#calculator", label: "Compare with Cloudinary", event: "pricing_calculator_clicked" }}
        note="Every account starts on Free. No card required."
      />

      <Container>
        <Sky tone="haze" className="rounded-lg px-4 py-10 md:px-12 md:py-14">
          <div className="grid gap-3 md:grid-cols-3">
            {plans.map((plan) => (
              <PlanCard key={plan.name} plan={plan} location="pricing" />
            ))}
          </div>
          <div className="mt-3">
            <PlanStrip location="pricing" />
          </div>
        </Sky>
        <div className="mt-3">
          <EveryPlan />
        </div>
      </Container>

      <Container id="calculator" className="pt-20 md:pt-28">
        <SplitHeading
          title="Leaving Cloudinary?"
          muted="See both bills."
          aside="Start from the Cloudinary plan you pay for, then move the sliders to what you actually use. Openinary Cloud is costed on the Cloud plan."
        />
        <div className="mt-10 overflow-hidden rounded-lg bg-tile p-2">
          <div className="overflow-hidden rounded-lg shadow-rule">
            <Calculator />
          </div>
        </div>
      </Container>

      <Container className="pt-20 md:pt-28">
        <SplitHeading
          title="Every difference, in one table."
          aside="Cloud and self-hosted run the same engine. What changes is who runs the servers and a few features Cloud doesn't have yet."
        >
          <StartButtons location="pricing_table" secondary={{ href: `${DOCS_URL}/cloud/overview`, label: "Cloud in the docs" }} />
        </SplitHeading>
        <div className="mt-10 overflow-x-auto rounded-lg bg-tile">
          <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b-[0.5px] border-ink-4">
                <th className="w-[34%] p-4 font-normal text-ink-10" />
                {[
                  ["Free", "$0/month"],
                  ["Cloud", "No monthly fee, usage"],
                  ["Self-hosted", "$0, your servers"],
                ].map(([name, sub]) => (
                  <th key={name} className="p-4 font-normal">
                    <span className="block text-ink-12">{name}</span>
                    <span className="block text-[12px] text-ink-10">{sub}</span>
                  </th>
                ))}
              </tr>
            </thead>
            {table.map((g) => (
              <tbody key={g.group}>
                <tr>
                  <th colSpan={4} className="px-4 pt-6 pb-2 font-normal">
                    <span className="block text-ink-12">{g.group}</span>
                    <span className="block text-[12px] text-ink-10">{g.sub}</span>
                  </th>
                </tr>
                {g.rows.map(([label, ...cells]) => (
                  <tr key={label} className="border-t-[0.5px] border-ink-4">
                    <td className="px-4 py-2.5 text-ink-11">{label}</td>
                    {cells.map((c, i) => (
                      <td key={i} className="px-4 py-2.5 text-ink-12">
                        {c === true ? (
                          <Check aria-label="Included" className="size-4" />
                        ) : c === false ? (
                          <Minus aria-label="Not included" className="size-4 text-ink-6" />
                        ) : (
                          c
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
        <div className="mt-4 text-[12px] text-ink-10">
          From the Cloud documentation. Running something bigger?{" "}
          <TalkToUs location="pricing_table" className="text-ink-11 underline decoration-ink-6 underline-offset-4 hover:text-ink-12" />
          .
        </div>
      </Container>

      <FaqBlock
        title="Billing questions, answered plainly."
        intro="Anything else about plans or invoices? Ask on GitHub, or email hello@openinary.dev."
        faqs={billingFaqs}
      />

      <FinalCta location="pricing_cta" />
    </SiteShell>
  );
}
