import type { Metadata } from "next";

import { GitHubMark } from "@/components/site/header";
import { FinalCta, PageHero, SiteShell, SplitHeading } from "@/components/site/shell";
import { APP_URL, ButtonLink, Container, GITHUB_URL, TextLink } from "@/components/site/ui";
import { cn } from "@/lib/utils";
import { getTransparency, type Month } from "@/lib/transparency";

export const metadata: Metadata = {
  title: "Transparency | Openinary",
  description:
    "Openinary's numbers in the open: GitHub activity, self-hosted servers, visitors, sign-ups, customers and revenue, refreshed every hour.",
  alternates: { canonical: "/transparency" },
};

// Rendered on request: the figures come from GitHub, PostHog and Autumn, each
// cached for an hour at the edge (lib/transparency.ts).
export const dynamic = "force-dynamic";

const SPONSORS_URL = "https://github.com/sponsors/openinary";

const number = new Intl.NumberFormat("en-US");
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const monthName = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });

export default async function TransparencyPage() {
  const { github, usage, selfHosted, business, railway } = await getTransparency();
  const noRevenue = business?.revenueByMonth.every((m) => m.value === 0) ?? false;

  return (
    <SiteShell>
      <PageHero
        title={
          <>
            Our numbers,
            <br /> in the open.
          </>
        }
        lede="The code is public, so are the figures behind it: how the project grows on GitHub, who uses it, and what it earns. Straight from the source, refreshed every hour."
        location="transparency_hero"
        actions={
          <div className="mt-7 flex flex-wrap gap-2">
            <ButtonLink href={GITHUB_URL} variant="secondary" data-track-event="github_star_clicked" data-track-prop-location="transparency_hero">
              <GitHubMark /> Star on GitHub
            </ButtonLink>
          </div>
        }
      />

      <Section
        title="Community."
        muted="From GitHub."
        aside="Everything lives in one public repository under the AGPL-3.0: the engine, the dashboard and the hosted version."
      >
        <Tiles>
          <Stat label="Stars" value={github && number.format(github.stars)} />
          <Stat label="Contributors" value={github && number.format(github.contributors)} />
          <Stat label="Merged pull requests" value={github && number.format(github.mergedPrs)} />
          <Stat label="Releases" value={github && number.format(github.releases)} />
          <Stat label="Forks" value={github && number.format(github.forks)} />
          <Stat label="Open issues" value={github && number.format(github.openIssues)} />
        </Tiles>
      </Section>

      <Section
        title="Self-hosted."
        muted="From telemetry."
        aside="Each server sends one anonymous heartbeat a day: version and storage type, no content, no IPs. Servers with OPENINARY_TELEMETRY=false aren't counted, so these are floors."
      >
        <Tiles>
          <Stat label="Servers installed" value={selfHosted && number.format(selfHosted.installs)} />
          <Stat label="Running, last 30 days" value={selfHosted && number.format(selfHosted.active30d)} />
          <Stat label="Running, last 7 days" value={selfHosted && number.format(selfHosted.active7d)} />
          <Stat label="Running for over 90 days" value={selfHosted && number.format(selfHosted.longRunning)} />
        </Tiles>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <Chart title="Servers running" note="Per month" data={selfHosted?.activeByMonth} format={number.format} />
          <Chart title="New installs" note="Per month" data={selfHosted?.installsByMonth} format={number.format} />
        </div>
      </Section>

      <Section
        title="Usage."
        muted="From PostHog and Railway."
        aside="People who read about Openinary and use Cloud, plus the servers deployed from our Railway template."
      >
        <Tiles>
          <Stat label="Visitors, last 30 days" value={usage && number.format(usage.visitors30d)} />
          <Stat label="Cloud sign-ups, last 30 days" value={usage && number.format(usage.signups30d)} />
          <Stat label="Active Cloud users, last 30 days" value={usage && number.format(usage.activeUsers30d)} />
          <Stat
            label="Railway deploys running"
            value={railway && `${number.format(railway.activeDeploys)} of ${number.format(railway.deploys)}`}
          />
        </Tiles>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <Chart title="Visitors" note="Per month" data={usage?.visitorsByMonth} format={number.format} />
          <Chart title="Cloud sign-ups" note="Per month" data={usage?.signupsByMonth} format={number.format} />
        </div>
      </Section>

      <Section
        title="Business."
        muted="From Autumn and Railway."
        aside="Cloud is pay as you go, so its revenue is what was collected each month, net of refunds. Railway also pays a share of what our template's deploys spend there."
      >
        <Tiles>
          <Stat label="Cloud customers" value={business && number.format(business.customers)} />
          <Stat label="Pay as you go customers" value={business && number.format(business.payingCustomers)} />
          <Stat label="Cloud revenue, last 30 days" value={business && usd.format(business.revenue30d)} />
          <Stat label="Railway template kickbacks" value={railway && usd.format(railway.earned)} />
        </Tiles>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {noRevenue ? (
            <NoRevenueYet />
          ) : (
            <Chart title="Revenue" note="Collected per month, USD" data={business?.revenueByMonth} format={usd.format} />
          )}
          <Chart title="Cloud customers" note="Running total" data={business?.customersByMonth} format={number.format} />
        </div>
      </Section>

      <Container className="pt-10 text-[12px] text-ink-10">
        Figures are refreshed every hour. A source that can&apos;t be reached shows n/a until it answers again.
      </Container>

      <div className="pt-16" />
      <FinalCta location="transparency_cta" />
    </SiteShell>
  );
}

/**
 * Twelve months at $0 read as a broken chart. Say it plainly instead and
 * point to Cloud; sponsoring stays a quiet text link.
 */
function NoRevenueYet() {
  return (
    <div className="mt-3 flex flex-col justify-between rounded-[14px] bg-tile p-4 md:p-5">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[13px] font-medium text-ink-12">Revenue</span>
        <span className="text-[12px] text-ink-10">Collected per month, USD</span>
      </div>
      <div className="mt-5 flex min-h-40 flex-col items-start justify-center">
        <p className="text-[20px] leading-7 tracking-[-0.02em] text-ink-12">No Cloud revenue yet.</p>
        <p className="mt-2 max-w-[400px] text-[13px] leading-5 text-ink-11">
          Cloud opened this summer and bills only for what you use. This chart fills in as the first invoices come in.
        </p>
        <ButtonLink href={APP_URL} className="mt-5" data-track-event="cloud_cta_clicked" data-track-prop-location="transparency_revenue">
          Start free
        </ButtonLink>
        <p className="mt-4 text-[13px] text-ink-10">
          Rather back the open source project?{" "}
          <TextLink href={SPONSORS_URL} data-track-event="sponsor_clicked" data-track-prop-location="transparency_revenue">
            Sponsor it on GitHub
          </TextLink>
        </p>
      </div>
    </div>
  );
}

function Section({
  title,
  muted,
  aside,
  children,
}: {
  title: string;
  muted: string;
  aside: string;
  children: React.ReactNode;
}) {
  return (
    <Container className="pt-16 md:pt-24">
      <SplitHeading title={title} muted={muted} aside={aside} />
      <div className="mt-8">{children}</div>
    </Container>
  );
}

/** Six figures in three columns; four in four. */
function Tiles({ children }: { children: React.ReactNode }) {
  const four = Array.isArray(children) && children.filter(Boolean).length === 4;
  return <div className={cn("grid grid-cols-2 gap-3", four ? "lg:grid-cols-4" : "md:grid-cols-3")}>{children}</div>;
}

/** One figure. Null means the source didn't answer: "n/a", not a zero. */
function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-lg bg-tile p-4 md:p-5">
      <p className="text-[12px] text-ink-10">{label}</p>
      <p className="mt-2 text-[28px] leading-8 font-normal tracking-[-0.04em] text-ink-12 tabular-nums md:text-[32px] md:leading-9">
        {value ?? "n/a"}
      </p>
    </div>
  );
}

/** Twelve months as bars, drawn on the server: no chart library. */
function Chart({
  title,
  note,
  data,
  format,
}: {
  title: string;
  note: string;
  data: Month[] | undefined;
  format: (n: number) => string;
}) {
  const max = Math.max(1, ...(data ?? []).map((d) => d.value));
  return (
    <figure className="mt-3 rounded-lg bg-tile p-4 md:p-5">
      <figcaption className="flex items-baseline justify-between gap-4">
        <span className="text-[13px] font-medium text-ink-12">{title}</span>
        <span className="text-[12px] text-ink-10">{note}</span>
      </figcaption>
      {data ? (
        <>
          <div className="mt-5 flex h-40 items-end gap-1.5" role="img" aria-label={`${title}, ${note.toLowerCase()}: ${data.map((d) => `${monthName(d.month)} ${format(d.value)}`).join(", ")}`}>
            {data.map((d, i) => (
              <div key={d.month} className="group relative flex h-full flex-1 items-end">
                <div
                  className={cn("w-full rounded-t-[4px] transition-colors", i === data.length - 1 ? "bg-ink-12" : "bg-ink-6 group-hover:bg-ink-9")}
                  style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }}
                />
                <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 rounded-md bg-ink-12 px-1.5 py-0.5 text-[11px] whitespace-nowrap text-page tabular-nums group-hover:block">
                  {format(d.value)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5 text-[10px] text-ink-10" aria-hidden>
            {data.map((d) => (
              <span key={d.month} className="flex-1 text-center">
                {monthName(d.month)}
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-5 grid h-40 place-items-center text-[13px] text-ink-10">Not available right now.</p>
      )}
    </figure>
  );
}
