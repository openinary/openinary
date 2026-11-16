// Request parsing shared by the media routes.

import { normalizeLevelPath, stripUrlHostile } from "@openinary/core/url";
import { decodeSegment } from "../cdn/path.js";

/**
 * A folder named by the client, as it is stored: URL-hostile characters
 * stripped, no leading or trailing slash, NFC. macOS hands the browser
 * NFD-decomposed accented names (e.g. dropped from Finder), while every reader
 * of the path (dashboard listing, CDN URLs typed or pasted in a browser) works
 * in NFC - storing the raw NFD form means the R2 key never matches what a
 * later request looks up.
 */
export function normalizeFolder(raw: unknown): string {
  return typeof raw === "string"
    ? stripUrlHostile(raw.trim())
        .replace(/^\/+|\/+$/g, "")
        .normalize("NFC")
    : "";
}

/** "?paths=a,b,c": trimmed, empties dropped. A string is the 400 message. */
export function parseList(raw: string | undefined, max: number): string[] | string {
  const items = (raw ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > max ? `Too many paths (max ${max})` : items;
}

/** Like parseList, each path normalized to a directory level. */
export function parseLevelList(
  raw: string | undefined,
  max: number,
): string[] | string {
  const items = parseList(raw, max);
  if (typeof items === "string") return items;
  const levels: string[] = [];
  for (const item of items) {
    const level = normalizeLevelPath(item);
    if (level === null) return "Invalid path";
    levels.push(level);
  }
  return levels;
}

/** The file path of a /storage/{path}[/suffix] request, decoded. */
export function storageFilePath(pathname: string, suffix?: RegExp): string {
  let rest = pathname.replace(/^\/storage\/?/, "");
  if (suffix) rest = rest.replace(suffix, "");
  return decodeSegment(rest.replace(/^\/+/, "").replace(/\/+$/, ""));
}
