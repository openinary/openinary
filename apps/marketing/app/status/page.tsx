import type { Metadata } from "next";

import { SiteShell } from "@/components/site/shell";
import { Container, H1, H2 } from "@/components/site/ui";
import { DAYS, IMPACT_LABEL, OVERALL_LABEL, getStatus, type Impact, type Incident } from "@/lib/status";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Status | Openinary",
  description: "Live status of Openinary Cloud: the API, media delivery, processing and the dashboard, with 90 days of incident history.",
  alternates: { canonical: "/status" },
};

// Rendered on request: probes are cached for a minute at the edge (lib/status.ts).
export const dynamic = "force-dynamic";

const DOT: Record<Impact, string> = {
  operational: "bg-ok",
  maintenance: "bg-info",
  degraded: "bg-warn",
  partial: "bg-warn",
  major: "bg-bad",
};
const TEXT: Record<Impact, string> = {
  operational: "text-ok",
  maintenance: "text-info",
  degraded: "text-warn",
  partial: "text-warn",
  major: "text-bad",
};
const BANNER: Record<Impact, string> = {
  operational: "bg-ok-bg",
  maintenance: "bg-info-bg",
  degraded: "bg-warn-bg",
  partial: "bg-warn-bg",
  major: "bg-bad-bg",
};
const UPDATE_LABEL: Record<Incident["updates"][number]["status"], string> = {
  investigating: "Investigating",
  identified: "Identified",
  monitoring: "Monitoring",
  resolved: "Resolved",
};

const when = (iso: string) =>
  `${new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  })} UTC`;
const dayLabel = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const pct = (n: number) => `${(Math.floor(n * 10000) / 100).toFixed(2)}%`;

export default async function StatusPage() {
  const status = await getStatus();

  return (
    <SiteShell>
      <Container className="max-w-[880px] pt-16 pb-24 md:pt-24">
        <H1 className="md:text-[56px]">Status</H1>

        <div className={cn("mt-8 flex items-center gap-3 rounded-xl px-5 py-4", BANNER[status.impact])} role="status">
          <span className={cn("size-2.5 shrink-0 rounded-full", DOT[status.impact])} aria-hidden />
          <p className="text-[17px] font-medium text-ink-12">{OVERALL_LABEL[status.impact]}</p>
          <p className="ml-auto hidden text-[13px] text-ink-10 sm:block">Checked {when(status.checkedAt)}</p>
        </div>

        {status.active.length > 0 ? (
          <section className="mt-10 flex flex-col gap-4" aria-labelledby="active">
            <h2 id="active" className="sr-only">Ongoing incidents</h2>
            {status.active.map((i) => (
              <IncidentCard key={i.id} incident={i} />
            ))}
          </section>
        ) : null}

        <section className="mt-12" aria-labelledby="systems">
          <div className="flex items-baseline justify-between gap-4">
            <H2 id="systems" className="text-[22px] md:text-[26px]">Systems</H2>
            <p className="text-[13px] text-ink-10">Uptime over the past {DAYS} days</p>
          </div>
          <ul className="mt-5 divide-y-[0.5px] divide-ink-4 rounded-xl border-[0.5px] border-ink-4">
            {status.components.map((c) => (
              <li key={c.id} className="px-5 py-5">
                <div className="flex items-baseline justify-between gap-4">
                  <div>
                    <p className="text-[15px] font-medium text-ink-12">{c.name}</p>
                    <p className="text-[13px] text-ink-10">{c.description}</p>
                  </div>
                  <p className={cn("shrink-0 text-[13px] font-medium", TEXT[c.impact])}>{IMPACT_LABEL[c.impact]}</p>
                </div>
                <div className="mt-4 flex h-8 gap-[2px]" aria-hidden>
                  {c.days.map((d, idx) => (
                    <span
                      key={d.date}
                      title={`${dayLabel(d.date)}: ${d.incidents.length ? d.incidents.join(", ") : "No incidents"}`}
                      className={cn(
                        "flex-1 rounded-[2px] opacity-80 transition-opacity hover:opacity-100",
                        DOT[d.impact],
                        // 90 bars don't fit a phone: show the last 30 there.
                        idx < DAYS - 30 && "hidden sm:block",
                      )}
                    />
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-[12px] text-ink-10">
                  <span className="sm:hidden">30 days ago</span>
                  <span className="hidden sm:inline">{DAYS} days ago</span>
                  <span>{pct(c.uptime)} uptime</span>
                  <span>Today</span>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] text-ink-10">
            The API and the dashboard are checked live every minute. Uptime counts the incidents below, a partial outage
            as 30% downtime.
          </p>
        </section>

        <section className="mt-16" aria-labelledby="history">
          <H2 id="history" className="text-[22px] md:text-[26px]">Past incidents</H2>
          {status.past.length ? (
            <div className="mt-5 flex flex-col gap-4">
              {status.past.map((i) => (
                <IncidentCard key={i.id} incident={i} />
              ))}
            </div>
          ) : (
            <p className="mt-4 text-[15px] text-ink-10">No incidents in the past {DAYS} days.</p>
          )}
        </section>
      </Container>
    </SiteShell>
  );
}

function IncidentCard({ incident }: { incident: Incident }) {
  return (
    <article id={incident.id} className="scroll-mt-24 rounded-xl border-[0.5px] border-ink-4 px-5 py-5">
      <div className="flex items-center gap-2.5">
        <span className={cn("size-2 shrink-0 rounded-full", DOT[incident.impact])} aria-hidden />
        <h3 className="text-[16px] font-medium text-ink-12">
          <a href={`#${incident.id}`} className="hover:underline">{incident.title}</a>
        </h3>
        <span className="ml-auto shrink-0 text-[12px] text-ink-10">{IMPACT_LABEL[incident.impact]}</span>
      </div>
      <ol className="mt-4 flex flex-col gap-4 border-l-[0.5px] border-ink-4 pl-4">
        {incident.updates.map((u) => (
          <li key={u.at}>
            <p className="text-[14px] text-ink-11">
              <span className="font-medium text-ink-12">{UPDATE_LABEL[u.status]}.</span> {u.body}
            </p>
            <p className="mt-1 text-[12px] text-ink-10">{when(u.at)}</p>
          </li>
        ))}
      </ol>
    </article>
  );
}
