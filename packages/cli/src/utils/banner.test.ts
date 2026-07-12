import { describe, expect, it } from "vitest";
import { renderLogo } from "./banner.js";

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");

describe("renderLogo", () => {
  it("renders aligned rows", () => {
    const lines = stripAnsi(renderLogo()).split("\n");
    expect(lines.length).toBeGreaterThan(1);
    const widths = lines.map((line) => [...line].length);
    expect(new Set(widths).size).toBe(1);
  });

  it("contains the wordmark glyphs", () => {
    const plain = stripAnsi(renderLogo());
    expect(plain).toContain("___");
    expect(plain).toContain("(_)");
  });
});
