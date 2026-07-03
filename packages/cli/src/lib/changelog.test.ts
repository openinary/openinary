import { describe, expect, it } from "vitest";
import { parseChangelogSections, renderChangelog, sectionsBetween } from "./changelog.js";

// Mirrors the real CHANGELOG.md format (Keep a Changelog).
const FIXTURE = `# Changelog

All notable changes to this project will be documented in this file.

## [0.1.3] - 2025-12-27

### Added
- Cache invalidation endpoint

## [0.1.2] - 2025-12-23

### Changed
- Asynchronous authentication initialization

## [0.1.1] - 2025-12-23

### Added
- Security measures to restrict user sign-ups
`;

describe("parseChangelogSections", () => {
  it("extracts each version section with its body", () => {
    const sections = parseChangelogSections(FIXTURE);
    expect(sections.map((s) => s.version)).toEqual(["0.1.3", "0.1.2", "0.1.1"]);
    expect(sections[0].body).toContain("Cache invalidation endpoint");
  });
});

describe("sectionsBetween", () => {
  it("returns only versions strictly after `from` and up to `to`", () => {
    const sections = sectionsBetween(FIXTURE, "0.1.1", "0.1.3");
    expect(sections.map((s) => s.version)).toEqual(["0.1.3", "0.1.2"]);
  });

  it("returns nothing when already at the target version", () => {
    expect(sectionsBetween(FIXTURE, "0.1.3", "0.1.3")).toEqual([]);
  });

  it("returns everything when upgrading from an unpinned baseline", () => {
    const sections = sectionsBetween(FIXTURE, "0.0.0", "0.1.3");
    expect(sections.map((s) => s.version)).toEqual(["0.1.3", "0.1.2", "0.1.1"]);
  });
});

describe("renderChangelog", () => {
  it("reports no changes for an empty section list", () => {
    expect(renderChangelog([])).toBe("No changes found.");
  });

  it("truncates long output and links to the full changelog", () => {
    const sections = Array.from({ length: 10 }, (_, i) => ({
      version: `0.${i}.0`,
      body: "line one\nline two\nline three",
    }));
    const rendered = renderChangelog(sections, 10);
    expect(rendered.split("\n").length).toBeLessThanOrEqual(11);
    expect(rendered).toContain("truncated");
  });
});
