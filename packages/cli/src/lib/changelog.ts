import { GITHUB_API_TIMEOUT_MS, REPO } from "../utils/constants.js";
import { compareVersions } from "./versions.js";

export async function fetchChangelog(tag: string): Promise<string | null> {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${REPO}/${tag}/CHANGELOG.md`, {
      signal: AbortSignal.timeout(GITHUB_API_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export interface ChangelogSection {
  version: string;
  body: string;
}

const SECTION_HEADER = /^## \[([^\]]+)\](?:\s*-\s*.*)?$/gm;

export function parseChangelogSections(content: string): ChangelogSection[] {
  const sections: ChangelogSection[] = [];
  const matches = [...content.matchAll(SECTION_HEADER)];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[i + 1]?.index ?? content.length;
    sections.push({ version: match[1], body: content.slice(start, end).trim() });
  }

  return sections;
}

/** Sections for versions strictly greater than `from` and up to and including `to`. */
export function sectionsBetween(content: string, from: string, to: string): ChangelogSection[] {
  return parseChangelogSections(content).filter((section) => {
    if (!/^\d/.test(section.version)) return false; // skip "Unreleased" etc.
    return compareVersions(section.version, from) > 0 && compareVersions(section.version, to) <= 0;
  });
}

export function renderChangelog(sections: ChangelogSection[], maxLines = 30): string {
  if (sections.length === 0) return "No changes found.";

  const lines: string[] = [];
  for (const section of sections) {
    lines.push(`## ${section.version}`, section.body, "");
  }

  const joined = lines.join("\n").trimEnd();
  const allLines = joined.split("\n");
  if (allLines.length <= maxLines) return joined;

  return `${allLines.slice(0, maxLines).join("\n")}\n… (truncated, full changelog: https://github.com/${REPO}/blob/main/CHANGELOG.md)`;
}
