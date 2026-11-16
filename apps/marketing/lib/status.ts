import { incidents as allIncidents } from "../data/incidents";
import { cached } from "./transparency";

/** Ordered from best to worst: the worst one wins wherever states combine. */
export const IMPACTS = ["operational", "maintenance", "degraded", "partial", "major"] as const;
export type Impact = (typeof IMPACTS)[number];

export const IMPACT_LABEL: Record<Impact, string> = {
  operational: "Operational",
  maintenance: "Under maintenance",
  degraded: "Degraded performance",
  partial: "Partial outage",
  major: "Major outage",
};

export const OVERALL_LABEL: Record<Impact, string> = {
  operational: "All systems operational",
  maintenance: "Scheduled maintenance in progress",
  degraded: "Some systems are slower than usual",
  partial: "Some systems are having trouble",
  major: "Major outage in progress",
};

export const COMPONENTS = [
  { id: "api", name: "API", description: "Uploads, management and the REST API.", probe: "https://cdn.openinary.dev/api" },
  { id: "delivery", name: "Media delivery", description: "Serving images and videos from the CDN." },
  { id: "processing", name: "Image and video processing", description: "Transformations and video transcoding." },
  { id: "dashboard", name: "Dashboard", description: "app.openinary.dev", probe: "https://app.openinary.dev" },
  { id: "website", name: "Website and docs", description: "openinary.dev and openinary.dev/docs" },
] as const satisfies readonly { id: string; name: string; description: string; probe?: string }[];
export type ComponentId = (typeof COMPONENTS)[number]["id"];

export type Incident = {
  /** Stable slug, used as the page anchor. */
  id: string;
  title: string;
  impact: Exclude<Impact, "operational">;
  components: ComponentId[];
  /** Newest first. ISO timestamps with a timezone, e.g. "2026-11-16T14:05:00Z". */
  updates: { at: string; status: "investigating" | "identified" | "monitoring" | "resolved"; body: string }[];
};

export const DAYS = 90;
const DAY_MS = 86_400_000;
/** A probe slower than this marks its component as degraded. */
const SLOW_MS = 3_000;
/** Statuspage's convention: a partial outage counts as 30% downtime. */
const DOWNTIME_WEIGHT: Partial<Record<Impact, number>> = { major: 1, partial: 0.3 };

const worst = (a: Impact, b: Impact) => (IMPACTS.indexOf(a) >= IMPACTS.indexOf(b) ? a : b);
const startOf = (i: Incident) => Math.min(...i.updates.map((u) => Date.parse(u.at)));
const endOf = (i: Incident) => {
  const resolved = i.updates.find((u) => u.status === "resolved");
  return resolved ? Date.parse(resolved.at) : null;
};

export type Day = { date: string; impact: Impact; incidents: string[] };
export type ComponentStatus = {
  id: ComponentId;
  name: string;
  description: string;
  impact: Impact;
  uptime: number;
  days: Day[];
};
export type Status = {
  checkedAt: string;
  impact: Impact;
  components: ComponentStatus[];
  active: Incident[];
  past: Incident[];
};

/** Pure: everything except the probes, so it can be checked without a network. */
export function computeStatus(now: number, incidents: Incident[], probes: Partial<Record<ComponentId, Impact>>): Status {
  const todayStart = Math.floor(now / DAY_MS) * DAY_MS;
  const windowStart = todayStart - (DAYS - 1) * DAY_MS;
  const windowMs = now - windowStart;
  const span = (i: Incident) => [startOf(i), endOf(i) ?? now] as const;
  const inWindow = incidents.filter((i) => span(i)[1] >= windowStart && span(i)[0] <= now);

  const components = COMPONENTS.map((c): ComponentStatus => {
    const mine = inWindow.filter((i) => (i.components as string[]).includes(c.id));
    const days = Array.from({ length: DAYS }, (_, d): Day => {
      const from = windowStart + d * DAY_MS;
      const hits = mine.filter((i) => span(i)[0] < from + DAY_MS && span(i)[1] >= from);
      return {
        date: new Date(from).toISOString().slice(0, 10),
        impact: hits.reduce<Impact>((acc, i) => worst(acc, i.impact), "operational"),
        incidents: hits.map((i) => i.title),
      };
    });
    const down = mine.reduce((sum, i) => {
      const [s, e] = span(i);
      return sum + (Math.min(e, now) - Math.max(s, windowStart)) * (DOWNTIME_WEIGHT[i.impact] ?? 0);
    }, 0);
    const declared = mine.filter((i) => endOf(i) === null).reduce<Impact>((acc, i) => worst(acc, i.impact), "operational");
    return {
      id: c.id,
      name: c.name,
      description: c.description,
      impact: worst(declared, probes[c.id] ?? "operational"),
      uptime: Math.max(0, 1 - down / windowMs),
      days,
    };
  });

  const byNewest = (a: Incident, b: Incident) => startOf(b) - startOf(a);
  return {
    checkedAt: new Date(now).toISOString(),
    impact: components.reduce<Impact>((acc, c) => worst(acc, c.impact), "operational"),
    components,
    active: inWindow.filter((i) => endOf(i) === null).sort(byNewest),
    past: inWindow.filter((i) => endOf(i) !== null).sort(byNewest),
  };
}

async function probe(url: string): Promise<Impact> {
  const started = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: "manual", cache: "no-store" });
    if (res.status >= 500) return "major";
    return Date.now() - started > SLOW_MS ? "degraded" : "operational";
  } catch {
    return "major";
  }
}

/**
 * Live probes, asked at most once a minute per Cloudflare location; history
 * comes from the incidents written up in data/incidents.ts.
 */
export async function getStatus(): Promise<Status> {
  const probes = await cached("status-probes-v1", 60, async () =>
    Object.fromEntries(
      await Promise.all(
        COMPONENTS.filter((c) => "probe" in c).map(async (c) => [c.id, await probe((c as { probe: string }).probe)] as const),
      ),
    ),
  );
  return computeStatus(Date.now(), allIncidents, probes);
}
