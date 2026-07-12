import { describe, expect, it } from "vitest";
import {
  appendMissingVars,
  diffMissingKeys,
  generateApiSecret,
  generateAuthSecret,
  getActiveKeys,
  getVar,
  parseEnv,
  serializeEnv,
  upsertVar,
} from "./env.js";

const SAMPLE = `# Comment line
IMAGE_TAG=latest

# Auth
BETTER_AUTH_SECRET=abc123
# CORS_ORIGIN=https://example.com
`;

describe("parseEnv / serializeEnv", () => {
  it("round-trips content exactly, preserving comments and blank lines", () => {
    const lines = parseEnv(SAMPLE);
    expect(serializeEnv(lines)).toBe(SAMPLE);
  });

  it("extracts active (uncommented) keys only", () => {
    const lines = parseEnv(SAMPLE);
    const keys = getActiveKeys(lines);
    expect(keys.has("IMAGE_TAG")).toBe(true);
    expect(keys.has("BETTER_AUTH_SECRET")).toBe(true);
    expect(keys.has("CORS_ORIGIN")).toBe(false);
  });

  it("reads a variable's value", () => {
    const lines = parseEnv(SAMPLE);
    expect(getVar(lines, "IMAGE_TAG")).toBe("latest");
    expect(getVar(lines, "CORS_ORIGIN")).toBeUndefined();
  });
});

describe("upsertVar", () => {
  it("replaces an existing active variable in place", () => {
    const lines = parseEnv(SAMPLE);
    const updated = upsertVar(lines, "IMAGE_TAG", "v0.2.0");
    expect(getVar(updated, "IMAGE_TAG")).toBe("v0.2.0");
    // still the same number of lines, replaced, not appended
    expect(updated.length).toBe(lines.length);
  });

  it("appends a new variable when the key doesn't exist", () => {
    const lines = parseEnv(SAMPLE);
    const updated = upsertVar(lines, "MAX_FILE_SIZE_MB", "100");
    expect(getVar(updated, "MAX_FILE_SIZE_MB")).toBe("100");
    expect(updated.length).toBe(lines.length + 1);
  });
});

describe("diffMissingKeys / appendMissingVars", () => {
  const template = parseEnv(`IMAGE_TAG=latest
BETTER_AUTH_SECRET=placeholder
MAX_FILE_SIZE_MB=50
`);

  it("finds keys present in the template but missing locally", () => {
    const current = parseEnv("IMAGE_TAG=v0.1.0\nBETTER_AUTH_SECRET=abc\n");
    const missing = diffMissingKeys(current, template);
    expect(missing).toEqual(["MAX_FILE_SIZE_MB"]);
  });

  it("returns nothing missing once all template keys are present", () => {
    const current = parseEnv("IMAGE_TAG=v0.1.0\nBETTER_AUTH_SECRET=abc\nMAX_FILE_SIZE_MB=50\n");
    expect(diffMissingKeys(current, template)).toEqual([]);
  });

  it("appends missing vars under a marker comment without touching existing lines", () => {
    const current = parseEnv("IMAGE_TAG=v0.1.0\nBETTER_AUTH_SECRET=abc\n");
    const missing = diffMissingKeys(current, template);
    const updated = appendMissingVars(current, template, missing);

    expect(getVar(updated, "MAX_FILE_SIZE_MB")).toBe("50");
    expect(serializeEnv(updated)).toContain("# added by openinary upgrade");
    expect(getVar(updated, "IMAGE_TAG")).toBe("v0.1.0");
  });
});

describe("generateAuthSecret", () => {
  it("produces a secret of at least 32 characters", () => {
    const secret = generateAuthSecret();
    expect(secret.length).toBeGreaterThanOrEqual(32);
  });

  it("produces different secrets on each call", () => {
    expect(generateAuthSecret()).not.toBe(generateAuthSecret());
  });
});

describe("generateApiSecret", () => {
  it("produces a 64-character hex secret", () => {
    const secret = generateApiSecret();
    expect(secret.length).toBe(64);
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different secrets on each call", () => {
    expect(generateApiSecret()).not.toBe(generateApiSecret());
  });
});
