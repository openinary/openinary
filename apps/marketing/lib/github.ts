import { REPO } from "@/lib/site";

const API = "https://api.github.com";
type Init = RequestInit & { next?: { revalidate?: number } };

export interface RepoStats {
  stars: number;
  forks: number;
  openPRs: number;
  closedPRs: number;
  contributors: number;
  latestRelease: string | null;
}

/** Every GitHub call: the caller's init, plus the API's Accept header. */
function request(path: string, init?: Init) {
  const headers = new Headers(init?.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/vnd.github+json");
  return fetch(`${API}${path}`, { ...init, headers });
}

async function getJson(path: string, init?: Init) {
  const res = await request(path, init);
  if (!res.ok) throw new Error(`GitHub ${path}: ${res.status}`);
  return res.json();
}

/** Star count, or null when GitHub can't be reached (rate limits included). */
export async function getStars(init?: Init): Promise<number | null> {
  try {
    const repo = await getJson(`/repos/${REPO}`, init);
    return typeof repo.stargazers_count === "number"
      ? repo.stargazers_count
      : null;
  } catch {
    return null;
  }
}

/** Repo stats for llms.txt, or null when a core figure is unavailable. */
export async function getRepoStats(init?: Init): Promise<RepoStats | null> {
  try {
    const [repo, open, closed, contributorsRes, releaseRes] = await Promise.all([
      getJson(`/repos/${REPO}`, init),
      getJson(`/search/issues?q=repo:${REPO}+type:pr+state:open`, init),
      getJson(`/search/issues?q=repo:${REPO}+type:pr+state:closed`, init),
      request(`/repos/${REPO}/contributors?per_page=1&anon=true`, init),
      request(`/repos/${REPO}/releases/latest`, init),
    ]);
    const release = releaseRes.ok ? await releaseRes.json() : null;

    // per_page=1, so the "last" page number in the Link header is the count.
    const last = (contributorsRes.headers.get("Link") ?? "").match(
      /page=(\d+)>; rel="last"/,
    );
    let contributors = last ? parseInt(last[1], 10) : 0;
    if (!last && contributorsRes.ok) {
      const data = await contributorsRes.json();
      contributors = Array.isArray(data) ? data.length : 0;
    }

    return {
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      openPRs: open.total_count,
      closedPRs: closed.total_count,
      contributors,
      latestRelease: release?.tag_name ?? null,
    };
  } catch {
    return null;
  }
}
