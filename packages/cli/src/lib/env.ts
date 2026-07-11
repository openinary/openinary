import crypto from "node:crypto";

export type EnvLine =
  | { type: "comment" | "blank"; raw: string }
  | { type: "var"; raw: string; key: string; value: string; commented: boolean };

const VAR_LINE = /^(\s*)(#\s*)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;

/** Parses .env content into a line array, preserving comments and blank lines. */
export function parseEnv(content: string): EnvLine[] {
  return content.split("\n").map((raw): EnvLine => {
    if (raw.trim() === "") return { type: "blank", raw };

    const match = raw.match(VAR_LINE);
    if (match) {
      const [, , commentPrefix, key, value] = match;
      return { type: "var", raw, key, value: value.trim(), commented: Boolean(commentPrefix) };
    }

    return { type: "comment", raw };
  });
}

export function serializeEnv(lines: EnvLine[]): string {
  return lines.map((line) => line.raw).join("\n");
}

/** Keys of active (uncommented) variables. */
export function getActiveKeys(lines: EnvLine[]): Set<string> {
  const keys = new Set<string>();
  for (const line of lines) {
    if (line.type === "var" && !line.commented) keys.add(line.key);
  }
  return keys;
}

/** Sets `key` to `value`, replacing an existing active line or appending a new one. */
export function upsertVar(lines: EnvLine[], key: string, value: string): EnvLine[] {
  const index = lines.findIndex((line) => line.type === "var" && !line.commented && line.key === key);
  const newLine: EnvLine = { type: "var", raw: `${key}=${value}`, key, value, commented: false };

  if (index === -1) return [...lines, newLine];

  const next = [...lines];
  next[index] = newLine;
  return next;
}

export function getVar(lines: EnvLine[], key: string): string | undefined {
  const line = lines.find((l) => l.type === "var" && !l.commented && l.key === key);
  return line && line.type === "var" ? line.value : undefined;
}

/** Returns keys present as active vars in `template` but missing from `current`. */
export function diffMissingKeys(current: EnvLine[], template: EnvLine[]): string[] {
  const currentKeys = getActiveKeys(current);
  const templateKeys = new Set<string>();
  const missing: string[] = [];

  for (const line of template) {
    if (line.type !== "var") continue;
    if (templateKeys.has(line.key)) continue;
    templateKeys.add(line.key);
    if (!currentKeys.has(line.key)) missing.push(line.key);
  }

  return missing;
}

/**
 * Appends the raw lines for `keys` (as they appear in `template`) to `current`,
 * under a marker comment. Used by `upgrade` to add new env vars introduced
 * upstream without touching existing ones.
 */
export function appendMissingVars(current: EnvLine[], template: EnvLine[], keys: string[]): EnvLine[] {
  if (keys.length === 0) return current;

  const keySet = new Set(keys);
  const additions = template.filter((line) => line.type === "var" && keySet.has(line.key));
  if (additions.length === 0) return current;

  return [
    ...current,
    { type: "blank", raw: "" },
    { type: "comment", raw: "# added by openinary upgrade" },
    ...additions,
  ];
}

export function generateAuthSecret(): string {
  return crypto.randomBytes(32).toString("base64");
}

/** 64 hex characters, matching the length required by API_SECRET (HMAC signing/verification). */
export function generateApiSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}
