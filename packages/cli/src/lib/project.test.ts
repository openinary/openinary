import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findProject, getProjectPort, loadProjectConfig, requireProject, writeProjectConfig } from "./project.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openinary-cli-test-"));
});

afterEach(async () => {
  await fs.remove(tmpDir);
});

const SAMPLE_CONFIG = {
  name: "my-project",
  version: "v0.1.3",
  mode: "full" as const,
  cliVersion: "0.1.0",
  createdAt: new Date().toISOString(),
};

describe("findProject", () => {
  it("returns null when no openinary.json exists anywhere up the tree", async () => {
    const nested = path.join(tmpDir, "a", "b", "c");
    await fs.ensureDir(nested);
    expect(await findProject(nested)).toBeNull();
  });

  it("finds the project config in the exact directory", async () => {
    await writeProjectConfig(tmpDir, SAMPLE_CONFIG);
    const result = await findProject(tmpDir);
    expect(result?.dir).toBe(tmpDir);
    expect(result?.config.name).toBe("my-project");
  });

  it("walks up parent directories to find the config", async () => {
    await writeProjectConfig(tmpDir, SAMPLE_CONFIG);
    const nested = path.join(tmpDir, "a", "b", "c");
    await fs.ensureDir(nested);
    const result = await findProject(nested);
    expect(result?.dir).toBe(tmpDir);
  });
});

describe("loadProjectConfig", () => {
  it("returns null when the file doesn't exist", async () => {
    expect(await loadProjectConfig(tmpDir)).toBeNull();
  });
});

describe("getProjectPort", () => {
  it("defaults to 3000 when there's no .env", async () => {
    await writeProjectConfig(tmpDir, SAMPLE_CONFIG);
    const project = await findProject(tmpDir);
    expect(await getProjectPort(project!)).toBe(3000);
  });

  it("reads OPENINARY_PORT from .env when present", async () => {
    await writeProjectConfig(tmpDir, SAMPLE_CONFIG);
    await fs.writeFile(path.join(tmpDir, ".env"), "OPENINARY_PORT=4000\n");
    const project = await findProject(tmpDir);
    expect(await getProjectPort(project!)).toBe(4000);
  });
});

describe("requireProject", () => {
  it("adopts an existing unmanaged docker-compose setup", async () => {
    await fs.writeFile(
      path.join(tmpDir, "docker-compose.yml"),
      "services:\n  openinary:\n    profiles: [\"full\"]\n    image: openinary/openinary:v0.1.5\n"
    );
    await fs.writeFile(path.join(tmpDir, ".env"), "IMAGE_TAG=v0.1.5\n");

    const project = await requireProject(tmpDir);
    expect(project.config.mode).toBe("full");
    expect(project.config.version).toBe("v0.1.5");
    expect(await fs.pathExists(path.join(tmpDir, "openinary.json"))).toBe(true);
  });

  it("throws with a helpful hint when nothing is found", async () => {
    await expect(requireProject(tmpDir)).rejects.toThrow(/No Openinary project found/);
  });

  it("refuses to adopt a directory that looks like the Openinary monorepo itself", async () => {
    await fs.writeFile(
      path.join(tmpDir, "docker-compose.yml"),
      "services:\n  openinary:\n    profiles: [\"full\"]\n    image: openinary/openinary:v0.1.5\n"
    );
    await fs.writeFile(path.join(tmpDir, ".env"), "IMAGE_TAG=v0.1.5\n");
    await fs.writeFile(path.join(tmpDir, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
    await fs.writeFile(path.join(tmpDir, "turbo.json"), "{}\n");

    await expect(requireProject(tmpDir)).rejects.toThrow(/No Openinary project found/);
    expect(await fs.pathExists(path.join(tmpDir, "openinary.json"))).toBe(false);
  });
});
