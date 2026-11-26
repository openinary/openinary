/**
 * The figures on /transparency, from the three places they live: GitHub (the
 * code and community), PostHog (visits and usage), Autumn (customers and
 * revenue) and Railway (the self-host template's deploys and kickbacks). Each source fails on its own: a missing key or a slow API leaves
 * its section without numbers, never the page down.
 *
 * Worker secrets (`npx wrangler secret put … --name marketing`), each optional:
 *   GITHUB_TOKEN              a fine-grained token, public repositories read-only.
 *                             Without it GitHub's per-IP quota (60/h, search
 *                             10/min) is shared with every other Worker and runs out.
 *   POSTHOG_PERSONAL_API_KEY  a personal key with query:read on the project
 *   POSTHOG_PROJECT_ID        the project's numeric id (EU cloud)
 *   AUTUMN_SECRET_KEY         the live secret key (am_sk_live_…)
 *   RAILWAY_TOKEN             a workspace token: reads the Railway template's
 *                             kickbacks and deploys (it can do more, keep it secret)
 */

import { after } from "next/server";

const REPO = "openinary/openinary";
const HOUR = 3600;

export type Month = { month: string; value: number };

export type Transparency = {
  updatedAt: string;
  github: {
    stars: number;
    forks: number;
    contributors: number;
    mergedPrs: number;
    releases: number;
    openIssues: number;
  } | null;
  usage: {
    visitorsByMonth: Month[];
    signupsByMonth: Month[];
    visitors30d: number;
    signups30d: number;
    activeUsers30d: number;
  } | null;
  business: {
    customers: number;
    payingCustomers: number;
    customersByMonth: Month[];
    revenueByMonth: Month[];
    revenue30d: number;
  } | null;
  railway: {
    /** Kickbacks Railway paid on the template, all time, USD. Railway gives no history. */
    earned: number;
    deploys: number;
    activeDeploys: number;
  } | null;
};

/**
 * Cloudflare's edge cache in front of a slow call, stale-while-revalidate:
 * past `ttl` seconds the last value is still served at once and refreshed
 * after the response (so no visitor waits on GitHub, PostHog or Autumn once a
 * location has a value), and a failed refresh (null) keeps the last good
 * value instead of turning it into "n/a". Only a location's very first visit
 * waits. Entries live `ttl * 24` so a long-unvisited location doesn't serve
 * something ancient. Outside a Worker (next dev) there is no cache and it just runs.
 */
export async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  if (!cache) return load();
  const url = `https://transparency.openinary.internal/swr/${key}`;
  const put = (at: number, value: T) =>
    cache.put(url, new Response(JSON.stringify({ at, value }), { headers: { "Cache-Control": `max-age=${ttl * 24}` } }));
  // An entry stamped this way is considered fresh for `seconds` more, then retried.
  const retryIn = (seconds: number) => Date.now() - (ttl - Math.min(ttl, seconds)) * 1000;

  const hit = await cache.match(url);
  const entry = hit ? ((await hit.json()) as { at: number; value: T }) : null;

  const refresh = async (): Promise<T> => {
    const value = await load();
    if (value === null && entry && entry.value !== null) {
      // The source failed: keep what we had, ask again in 5 minutes.
      await put(retryIn(300), entry.value);
      return entry.value;
    }
    // A source that has never answered is asked again in 5 minutes, not on every visit.
    await put(value === null ? retryIn(300) : Date.now(), value);
    return value;
  };

  if (!entry) return refresh();
  if (Date.now() - entry.at > ttl * 1000) {
    // Claim the refresh for a minute so concurrent visitors don't all start one.
    await put(retryIn(60), entry.value);
    after(refresh);
  }
  return entry.value;
}

/** Thrown when a source has no credentials: expected, so not logged. */
class NotConfigured extends Error {}

/** Settles a source without letting it take the page down. */
async function settle<T>(name: string, load: () => Promise<T>): Promise<T | null> {
  try {
    // A slow source gives up after 8s instead of holding the whole page.
    return await Promise.race([
      load(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out after 8s")), 8000)),
    ]);
  } catch (error) {
    if (!(error instanceof NotConfigured)) console.error("transparency: source failed", name, error);
    return null;
  }
}

const monthOf = (date: string | number | Date) => new Date(date).toISOString().slice(0, 7);

/** The last `n` calendar months, oldest first, as YYYY-MM. */
function lastMonths(n: number): string[] {
  const now = new Date();
  return Array.from({ length: n }, (_, i) =>
    monthOf(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1 - i), 1)),
  );
}

/** Fills the months a source had nothing for with 0 (or the running total). */
function series(values: Map<string, number>, months: string[], cumulative = false, before = 0): Month[] {
  let total = before;
  return months.map((month) => {
    const v = values.get(month) ?? 0;
    total += v;
    return { month, value: cumulative ? total : v };
  });
}

// ---- GitHub ----

async function gh(path: string): Promise<Response> {
  const token = process.env.GITHUB_TOKEN;
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "openinary-transparency",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub ${path}: ${res.status}`);
  return res;
}

/** A list's total from its last page link, with one item per page. */
async function countOf(path: string): Promise<number> {
  const res = await gh(`${path}${path.includes("?") ? "&" : "?"}per_page=1`);
  const last = res.headers.get("link")?.match(/[?&]page=(\d+)>; rel="last"/);
  if (last) return Number(last[1]);
  return ((await res.json()) as unknown[]).length;
}

async function github(): Promise<Transparency["github"]> {
  const repo = (await (await gh(`/repos/${REPO}`)).json()) as {
    stargazers_count: number;
    forks_count: number;
    open_issues_count: number;
  };
  const [contributors, releases, merged, openPrs] = await Promise.all([
    countOf(`/repos/${REPO}/contributors?anon=true`),
    countOf(`/repos/${REPO}/releases`),
    gh(`/search/issues?q=${encodeURIComponent(`repo:${REPO} is:pr is:merged`)}&per_page=1`).then(
      async (r) => ((await r.json()) as { total_count: number }).total_count,
    ),
    gh(`/search/issues?q=${encodeURIComponent(`repo:${REPO} is:pr is:open`)}&per_page=1`).then(
      async (r) => ((await r.json()) as { total_count: number }).total_count,
    ),
  ]);

  return {
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    contributors,
    mergedPrs: merged,
    releases,
    // GitHub counts open pull requests as issues; these are issues alone.
    openIssues: Math.max(0, repo.open_issues_count - openPrs),
  };
}

// ---- PostHog ----

async function hogql(query: string): Promise<unknown[][]> {
  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  const project = process.env.POSTHOG_PROJECT_ID;
  if (!key || !project) throw new NotConfigured("PostHog");
  const res = await fetch(`https://eu.posthog.com/api/projects/${project}/query/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!res.ok) throw new Error(`PostHog: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { results: unknown[][] }).results;
}

const monthly = (rows: unknown[][]) => new Map(rows.map(([m, n]) => [monthOf(String(m)), Number(n)]));

async function usage(): Promise<Transparency["usage"]> {
  const months = lastMonths(12);
  const [visitors, signups, active] = await Promise.all([
    // People who opened the marketing site, the docs included, each month.
    hogql(`
      SELECT toStartOfMonth(timestamp) AS m, count(DISTINCT person_id)
      FROM events
      WHERE event = '$pageview' AND properties.$host = 'openinary.dev'
        AND timestamp >= toStartOfMonth(now() - INTERVAL 11 MONTH)
      GROUP BY m ORDER BY m`),
    // Cloud accounts created (the server sends it at sign-up).
    hogql(`
      SELECT toStartOfMonth(timestamp) AS m, count()
      FROM events
      WHERE event = 'cloud_account_created'
        AND timestamp >= toStartOfMonth(now() - INTERVAL 11 MONTH)
      GROUP BY m ORDER BY m`),
    // The last 30 days in one row: visitors, sign-ups, and people who used
    // the Cloud dashboard.
    hogql(`
      SELECT
        count(DISTINCT if(event = '$pageview' AND properties.$host = 'openinary.dev', person_id, NULL)),
        countIf(event = 'cloud_account_created'),
        count(DISTINCT if(properties.$host = 'app.openinary.dev', person_id, NULL))
      FROM events
      WHERE timestamp >= now() - INTERVAL 30 DAY`),
  ]);
  return {
    visitorsByMonth: series(monthly(visitors), months),
    signupsByMonth: series(monthly(signups), months),
    visitors30d: Number(active[0]?.[0] ?? 0),
    signups30d: Number(active[0]?.[1] ?? 0),
    activeUsers30d: Number(active[0]?.[2] ?? 0),
  };
}

// ---- Autumn ----

async function autumnSql(sql: string): Promise<unknown[][]> {
  const key = process.env.AUTUMN_SECRET_KEY;
  if (!key) throw new NotConfigured("Autumn");
  const res = await fetch("https://api.useautumn.com/v1/analytics.query", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "x-api-version": "2.6.0", "Content-Type": "application/json" },
    body: JSON.stringify({ sql }),
  });
  if (!res.ok) throw new Error(`Autumn: ${res.status} ${(await res.text()).slice(0, 200)}`);
  // Newline-delimited JSON: columns, one line per row, then end or error.
  const rows: unknown[][] = [];
  for (const line of (await res.text()).split("\n")) {
    if (!line.trim()) continue;
    const msg = JSON.parse(line) as { type: string; values?: unknown[]; message?: string };
    if (msg.type === "row" && msg.values) rows.push(msg.values);
    if (msg.type === "error") throw new Error(`Autumn: ${msg.message}`);
  }
  return rows;
}

async function business(): Promise<Transparency["business"]> {
  const months = lastMonths(12);
  // One at a time: Autumn answers 429 to queries sent in parallel.
  const created = await autumnSql(
    "SELECT strftime(to_timestamp(created_at / 1000), '%Y-%m') AS month, count(*) FROM customers GROUP BY 1 ORDER BY 1",
  );
  // Customers on a plan they chose: the free plan is attached automatically.
  const paying = await autumnSql(
    "SELECT count(DISTINCT customer_id) FROM subscriptions WHERE status = 'active' AND NOT coalesce(auto_enable, false)",
  );
  // What was actually collected each month, net of refunds, in US dollars.
  const revenue = await autumnSql(
    "SELECT strftime(to_timestamp(created_at / 1000), '%Y-%m') AS month, sum(amount_paid - coalesce(refunded_amount, 0)) FROM invoices WHERE status = 'paid' AND lower(currency) = 'usd' GROUP BY 1 ORDER BY 1",
  );
  const last30 = await autumnSql(
    "SELECT coalesce(sum(amount_paid - coalesce(refunded_amount, 0)), 0) FROM invoices WHERE status = 'paid' AND lower(currency) = 'usd' AND created_at >= epoch_ms(now() - INTERVAL 30 DAY)",
  );
  const perMonth = new Map(created.map(([m, n]) => [String(m), Number(n)]));
  const before = [...perMonth].filter(([m]) => m < months[0]).reduce((n, [, v]) => n + v, 0);
  const customers = [...perMonth.values()].reduce((n, v) => n + v, 0);
  return {
    customers,
    payingCustomers: Number(paying[0]?.[0] ?? 0),
    customersByMonth: series(perMonth, months, true, before),
    revenueByMonth: series(new Map(revenue.map(([m, v]) => [String(m), Number(v)])), months),
    revenue30d: Number(last30[0]?.[0] ?? 0),
  };
}

// ---- Railway ----

async function railwayGql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const token = process.env.RAILWAY_TOKEN;
  if (!token) throw new NotConfigured("Railway");
  const res = await fetch("https://backboard.railway.com/graphql/v2", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Railway: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const { data, errors } = (await res.json()) as { data: T; errors?: { message: string }[] };
  if (errors?.length) throw new Error(`Railway: ${errors[0].message}`);
  return data;
}

type Template = { name: string; code: string; totalPayout: number; projects: number; activeProjects: number };

/**
 * The Openinary template on Railway: what its kickbacks have paid and how
 * often it was deployed. The same GraphQL fields Railway's own template
 * pages use (see github.com/IKatsuba/railway-template-kickback).
 */
async function railway(): Promise<Transparency["railway"]> {
  // A workspace token can't read `me`; its workspace comes from its projects.
  const { projects } = await railwayGql<{ projects: { edges: { node: { workspaceId: string } }[] } }>(
    "query { projects(first: 100) { edges { node { workspaceId } } } }",
  );
  const workspaces = [...new Set(projects.edges.map((e) => e.node.workspaceId))];
  const templates = (
    await Promise.all(
      workspaces.map((id) =>
        railwayGql<{ teamTemplates: { edges: { node: Template }[] } }>(
          `query ($teamId: String!) {
            teamTemplates(teamId: $teamId) { edges { node { name code totalPayout projects activeProjects } } }
          }`,
          { teamId: id },
        ),
      ),
    )
  ).flatMap((d) => d.teamTemplates.edges.map((e) => e.node));
  // Only Openinary's: the account may publish other templates.
  const ours = templates.filter((t) => /openinary/i.test(`${t.name} ${t.code}`));
  if (ours.length === 0) throw new Error("Railway: no Openinary template in these workspaces");
  return {
    earned: ours.reduce((n, t) => n + Number(t.totalPayout ?? 0), 0),
    deploys: ours.reduce((n, t) => n + Number(t.projects ?? 0), 0),
    activeDeploys: ours.reduce((n, t) => n + Number(t.activeProjects ?? 0), 0),
  };
}

export async function getTransparency(): Promise<Transparency> {
  const [gitHub, usageData, businessData, railwayData] = await Promise.all([
    cached("github-v1", HOUR, () => settle("github", github)),
    cached("usage-v2", HOUR, () => settle("posthog", usage)),
    cached("business-v2", HOUR, () => settle("autumn", business)),
    cached("railway-v1", HOUR, () => settle("railway", railway)),
  ]);
  return {
    updatedAt: new Date().toISOString(),
    github: gitHub,
    usage: usageData,
    business: businessData,
    railway: railwayData,
  };
}
