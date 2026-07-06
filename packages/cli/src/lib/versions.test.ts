import { describe, expect, it } from "vitest";
import { compareVersions } from "./versions.js";

describe("compareVersions", () => {
  it("orders patch versions", () => {
    expect(compareVersions("v0.1.9", "v0.1.11")).toBe(-1);
    expect(compareVersions("v0.1.11", "v0.1.9")).toBe(1);
  });

  it("treats equal versions as equal regardless of the v prefix", () => {
    expect(compareVersions("v0.1.3", "0.1.3")).toBe(0);
  });

  it("orders minor and major versions", () => {
    expect(compareVersions("v0.2.0", "v0.1.11")).toBe(1);
    expect(compareVersions("v1.0.0", "v0.9.9")).toBe(1);
  });

  it("treats non-semver values (e.g. 'latest') as greater than any concrete version", () => {
    expect(compareVersions("latest", "v0.1.11")).toBe(1);
    expect(compareVersions("v0.1.11", "latest")).toBe(-1);
  });
});
