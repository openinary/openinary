import Link from "next/link";
import { Check } from "lucide-react";

import pricing from "@/data/pricing.json";
import { APP_URL, DOCS_URL, Pill, buttonClass } from "@/components/site/ui";
import { cn } from "@/lib/utils";

/**
 * The plan cards, shared by the homepage teaser and /pricing. Every figure
 * comes from data/pricing.json, the same file the calculator reads, so the two
 * can't quote different rates.
 */

const { free, included, rates } = pricing.openinaryCloud;
const n = (v: number) => v.toLocaleString("en-US");

export const rateLines = [
  { label: "Storage", value: `$${rates.storageGbMonthUsd} per GB a month` },
  { label: "Transformations", value: `$${rates.per1kTransformationsUsd.toFixed(2)} per 1,000` },
  { label: "Video processing", value: `$${rates.perVideoMinuteUsd} per minute` },
  { label: "CDN requests", value: `$${(rates.per10kRequestsUsd * 10).toFixed(2)} per 100,000` },
];

const quotaLines = (q: typeof free) => [
  `${q.storageGb} GB of storage`,
  `${n(q.transformations)} image transformations a month`,
  `${q.videoMinutes} minutes of video processing a month`,
  `${n(q.cdnRequests)} CDN requests a month`,
];
export const freeLines = quotaLines(free);

/** Cloud: what's included, then what each unit costs past it, as the Autumn plan reads. */
export const cloudLines = [
  `${included.storageGb} GB of storage, then $${rates.storageGbMonthUsd} per GB`,
  `${n(included.transformations)} transformations, then $${rates.per1kTransformationsUsd.toFixed(2)} per 1,000`,
  `${included.videoMinutes} video minutes, then $${rates.perVideoMinuteUsd} per minute`,
  `${n(included.cdnRequests)} CDN requests, then $${(rates.per10kRequestsUsd * 10).toFixed(2)} per 100,000`,
];

export type Plan = {
  name: string;
  badge?: string;
  price: string;
  unit: string;
  sub: string;
  blurb: string;
  cta: { label: string; href: string; event: string };
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
    name: "Cloud",
    badge: "Pay as you go",
    price: `$${rates.per1kTransformationsUsd.toFixed(2)}`,
    unit: "per 1,000 transformations",
    sub: "Openinary Cloud",
    blurb: "Twice the Free allowance and no monthly fee. Past it, each unit at the rate below.",
    cta: { label: "Start free", href: APP_URL, event: "cloud_cta_clicked" },
    lines: cloudLines,
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
