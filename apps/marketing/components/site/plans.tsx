import Link from "next/link";
import { Check } from "lucide-react";

import { PLANS } from "@openinary/plans";

import { APP_URL, DOCS_URL, Pill, buttonClass } from "@/components/site/ui";
import { freeQuotas, freeStorageLabel, paidPitch, paidPlan, rateLines } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/**
 * The plan cards, shared by the homepage teaser and /pricing. Every figure
 * comes from @openinary/plans, the same catalog the calculator and the
 * dashboard read, so none of them can quote different numbers.
 */

export { rateLines };
const n = (v: number) => v.toLocaleString("en-US");
const people = (k: number) => (k === 1 ? "1 team member" : `${k} team members`);
const buckets = (k: number) => (k === 1 ? "1 bucket" : `${k} buckets`);

export const freeLines = [
  `${freeStorageLabel} of storage`,
  `${n(freeQuotas.transformations)} image transformations a month`,
  `${freeQuotas.videoMinutes} minutes of video processing a month`,
  `${n(freeQuotas.cdnRequests)} CDN requests a month`,
  `${buckets(PLANS.free.buckets)}, ${people(PLANS.free.seats)}`,
];

/** Pay as you go: Railway's three lines, then what each unit costs. */
export const paidLines = [
  ...paidPitch,
  ...rateLines.map((r) => `${r.label}: ${r.value}`),
  `${buckets(paidPlan.buckets)}, ${people(paidPlan.seats)}`,
];

export type Plan = {
  name: string;
  badge?: string;
  price: string;
  unit: string;
  sub: string;
  blurb: string;
  cta: { label: string; href: string; event: string; plan?: string };
  primary?: boolean;
  lines: string[];
};

export const plans: Plan[] = [
  {
    name: "Self-hosted",
    badge: "Open source",
    price: "$0",
    unit: "forever",
    sub: "On a server you run",
    blurb: "The whole engine and dashboard on your own infrastructure, with your own bucket.",
    cta: { label: "Self-host guide", href: `${DOCS_URL}/quickstart`, event: "self_host_clicked" },
    lines: [
      "Unlimited files and transformations",
      "Images, video, audio and 3D",
      "Dashboard, API keys and logs",
      "AGPL-3.0 code on GitHub",
    ],
  },
  {
    name: "Free",
    badge: "No card required",
    price: "$0",
    unit: "/month",
    sub: "Openinary Cloud",
    blurb: "We run it for you: storage, transforms, video queue and CDN.",
    cta: { label: "Start free", href: APP_URL, event: "cloud_cta_clicked" },
    primary: true,
    lines: freeLines,
  },
  {
    name: paidPlan.name,
    badge: "Usage based",
    price: `$${paidPlan.monthlyUsd}`,
    unit: "minimum usage / month",
    sub: "Openinary Cloud",
    blurb: `Your $${paidPlan.monthlyUsd} covers the first $${paidPlan.creditUsd} of usage. Past it, each unit at the price below, and nothing stops.`,
    // ?plan=payg: the app keeps it through sign-up and opens the onboarding's
    // plan step on Pay as you go, one click from the checkout.
    cta: {
      label: "Start with pay as you go",
      href: `${APP_URL}/?plan=payg`,
      event: "cloud_cta_clicked",
      plan: "payg",
    },
    lines: paidLines,
  },
];

export function PlanCard({ plan, location }: { plan: Plan; location: string }) {
  return (
    <div
      className={cn(
        "flex flex-col shot-rim",
        plan.primary && "md:-my-2",
      )}
    >
      <div className="flex flex-1 flex-col rounded-[11px] bg-panel p-5">
        <h3 className="flex flex-wrap items-center gap-2 text-[16px] font-medium text-ink-12">
          {plan.name}
          {plan.badge ? <Pill>{plan.badge}</Pill> : null}
        </h3>
        <p className="mt-1 text-[13px] text-ink-10">{plan.sub}</p>
        <p className="mt-5 flex items-baseline gap-1">
          <span className="text-[36px] leading-none tracking-[-0.04em] text-ink-12">{plan.price}</span>
          <span className="text-[12px] text-ink-10">{plan.unit}</span>
        </p>
        <p className="mt-4 min-h-10 text-[13px] leading-5 text-ink-11">{plan.blurb}</p>
        <Link
          href={plan.cta.href}
          {...(plan.cta.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          data-track-event={plan.cta.event}
          data-track-prop-location={location}
          {...(plan.cta.plan && { "data-track-prop-plan": plan.cta.plan })}
          className={buttonClass(plan.primary ? "primary" : "secondary", "mt-5 w-full")}
        >
          {plan.cta.label}
        </Link>
        <ul className="mt-5 flex flex-col">
          {plan.lines.map((l) => (
            <li key={l} className="border-t-[0.5px] border-ink-4 py-2.5 text-[13px] leading-5 text-ink-11">
              {l}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The wide strip under the cards: Enterprise, and the way to the calculator. */
export function PlanStrip({ location }: { location: string }) {
  return (
    <div className="shot-rim">
      <div className="grid gap-px overflow-hidden rounded-[11px] bg-ink-4 md:grid-cols-2">
        <div className="flex items-center justify-between gap-4 bg-panel p-5">
          <div>
            <p className="flex items-center gap-2 text-[16px] font-medium">
              Enterprise <Pill>Custom</Pill>
            </p>
            <p className="mt-1 text-[13px] text-ink-11">SSO, a support SLA, a commercial licence and your Cloudinary migration done for you.</p>
          </div>
          <Link
            href="/pricing#business"
            data-track-event="enterprise_details_clicked"
            data-track-prop-location={location}
            className={buttonClass("secondary")}
          >
            See Enterprise
          </Link>
        </div>
        <div className="flex items-center justify-between gap-4 bg-panel p-5">
          <div>
            <p className="flex items-center gap-2 text-[16px] font-medium">
              Leaving Cloudinary? <Pill tone="green">Calculator</Pill>
            </p>
            <p className="mt-1 text-[13px] text-ink-11">Put in what you use today and see both bills side by side.</p>
          </div>
          <Link href="/pricing#calculator" className={buttonClass("secondary")}>
            Compare costs
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Line every plan shares, under the cards on /pricing. */
export const everyPlan = [
  "Images, video, audio and 3D files",
  "Transformations from the URL",
  "AVIF and WebP picked per browser",
  "Same transformation syntax",
  "Drop-in React file uploader",
  "API keys and delivery logs",
];

export function EveryPlan() {
  return (
    <div className="grid gap-4 rounded-lg bg-tile p-5 md:grid-cols-[200px_1fr] md:p-6">
      <p className="text-[15px] text-ink-12">Every plan includes</p>
      <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {everyPlan.map((l) => (
          <li key={l} className="flex gap-2 text-[13px] text-ink-11">
            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-12" />
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}
