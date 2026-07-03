import { FALLBACK_VERSION, GITHUB_API_TIMEOUT_MS, REPO } from "../utils/constants.js";

export interface LatestRelease {
  version: string;
  fromFallback: boolean;
}

/**
 * Resolves the latest published Openinary release tag (e.g. "v0.1.11").
 * Falls back to FALLBACK_VERSION ("latest") when GitHub is unreachable, so
 * scaffolding still works offline — callers should warn when `fromFallback`.
 */
export async function getLatestRelease(): Promise<LatestRelease> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      signal: AbortSignal.timeout(GITHUB_API_TIMEOUT_MS),
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error(`GitHub API responded ${res.status}`);
    const data = (await res.json()) as { tag_name?: string };
    if (!data.tag_name) throw new Error("No tag_name in latest release");
    return { version: data.tag_name, fromFallback: false };
  } catch {
    return { version: FALLBACK_VERSION, fromFallback: true };
  }
}

function parseSemver(version: string): [number, number, number] | null {
  const match = version.replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Returns -1, 0, or 1. Non-semver values (e.g. "latest") sort as greater than any concrete version. */
export function compareVersions(a: string, b: string): number {
  const parsedA = parseSemver(a);
  const parsedB = parseSemver(b);

  if (!parsedA && !parsedB) return 0;
  if (!parsedA) return 1;
  if (!parsedB) return -1;

  for (let i = 0; i < 3; i++) {
    if (parsedA[i] !== parsedB[i]) return parsedA[i] < parsedB[i] ? -1 : 1;
  }
  return 0;
}

export async function getRunningVersion(port: number): Promise<string | null> {
  try {
    const res = await fetch(`http://localhost:${port}/api/version`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}
