import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateSecret } from "./env.js";
import {
  KNOWN_COMPOSE_TEMPLATES,
  refreshComposeFile,
  resolveTemplatesDir,
  scaffoldFromEmbeddedTemplate,
  sha256,
} from "./template.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openinary-cli-scaffold-"));
});

afterEach(async () => {
  await fs.remove(tmpDir);
});

describe("scaffoldFromEmbeddedTemplate", () => {
  it("writes exactly the expected project files", async () => {
    await scaffoldFromEmbeddedTemplate(tmpDir, {
      projectName: "my-project",
      mode: "full",
      port: 3000,
      authSecret: generateSecret(),
      authUrl: "http://localhost:3000",
      apiSecret: generateSecret(),
      imageTag: "v0.1.3",
    });

    const entries = (await fs.readdir(tmpDir)).sort();
    expect(entries).toEqual(["README.md", ".env", ".gitignore", "docker-compose.yml"].sort());
  });

  // Regression: .env held STORAGE_* and CORS_ORIGIN but the compose file
  // forwarded neither, so the containers never saw them.
  it("hands every service the whole .env", async () => {
    await scaffoldFromEmbeddedTemplate(tmpDir, {
      projectName: "my-project",
      mode: "full",
      port: 3000,
      authSecret: generateSecret(),
      authUrl: "http://localhost:3000",
      apiSecret: generateSecret(),
      imageTag: "v0.1.3",
    });

    const compose = await fs.readFile(path.join(tmpDir, "docker-compose.yml"), "utf8");
    const services = compose.match(/^ {4}profiles:/gm)?.length;
    expect(services).toBe(2);
    expect(compose.match(/^ {4}env_file: \.env$/gm)?.length).toBe(services);
  });

  it("substitutes the image tag, port, and auth url placeholders", async () => {
    await scaffoldFromEmbeddedTemplate(tmpDir, {
      projectName: "my-project",
      mode: "api",
      port: 4000,
      authSecret: "x".repeat(32),
      authUrl: "http://localhost:4000",
      apiSecret: "y".repeat(64),
      imageTag: "v0.9.0",
    });

    const env = await fs.readFile(path.join(tmpDir, ".env"), "utf8");
    expect(env).toContain("IMAGE_TAG=v0.9.0");
    expect(env).toContain("OPENINARY_PORT=4000");
    expect(env).toContain("BETTER_AUTH_URL=http://localhost:4000");
    expect(env).not.toContain("{{");

    const readme = await fs.readFile(path.join(tmpDir, "README.md"), "utf8");
    expect(readme).toContain("my-project");
    expect(readme).not.toContain("{{");
  });

  it("leaves storage vars commented out by default", async () => {
    await scaffoldFromEmbeddedTemplate(tmpDir, {
      projectName: "my-project",
      mode: "full",
      port: 3000,
      authSecret: "x".repeat(32),
      authUrl: "http://localhost:3000",
      apiSecret: "y".repeat(64),
      imageTag: "v0.1.3",
    });

    const env = await fs.readFile(path.join(tmpDir, ".env"), "utf8");
    expect(env).toContain("# STORAGE_BUCKET_NAME=your-bucket");
  });

  it("fills in placeholder storage vars when s3 is chosen", async () => {
    await scaffoldFromEmbeddedTemplate(tmpDir, {
      projectName: "my-project",
      mode: "full",
      port: 3000,
      authSecret: "x".repeat(32),
      authUrl: "http://localhost:3000",
      apiSecret: "y".repeat(64),
      imageTag: "v0.1.3",
      storage: "s3",
    });

    const env = await fs.readFile(path.join(tmpDir, ".env"), "utf8");
    expect(env).toContain("STORAGE_BUCKET_NAME=your-bucket");
    expect(env).not.toContain("# STORAGE_BUCKET_NAME=your-bucket");
  });
});

// Regression: upgrade never touched docker-compose.yml, so existing projects
// kept a compose file that did not forward .env to the containers.
describe("refreshComposeFile", () => {
  const compose = () => fs.readFile(path.join(tmpDir, "docker-compose.yml"), "utf8");
  const bak = () => path.join(tmpDir, "docker-compose.yml.bak");
  const template = () =>
    fs.readFile(path.join(resolveTemplatesDir(), "project", "docker-compose.yml"), "utf8");

  it("lists the bundled template among the known ones (add its hash when you edit it)", async () => {
    expect(KNOWN_COMPOSE_TEMPLATES.has(sha256(await template()))).toBe(true);
  });

  it("replaces a stock older template and keeps a backup", async () => {
    const old = (await template()).replace(/^ {4}env_file: \.env\n/gm, "");
    await fs.writeFile(path.join(tmpDir, "docker-compose.yml"), old);
    // Stand-in for a real older template: register its hash for this test.
    KNOWN_COMPOSE_TEMPLATES.add(sha256(old));
    try {
      expect(await refreshComposeFile(tmpDir)).toBe("refreshed");
    } finally {
      KNOWN_COMPOSE_TEMPLATES.delete(sha256(old));
    }
    expect(await compose()).toBe(await template());
    expect(await fs.readFile(bak(), "utf8")).toBe(old);
  });

  it("leaves a hand-edited file in place and writes the template beside it", async () => {
    const edited = (await template()) + "\n# my tweak\n";
    await fs.writeFile(path.join(tmpDir, "docker-compose.yml"), edited);
    expect(await refreshComposeFile(tmpDir)).toBe("kept-edited");
    expect(await compose()).toBe(edited);
    expect(await fs.readFile(path.join(tmpDir, "docker-compose.yml.new"), "utf8")).toBe(await template());
    expect(await fs.pathExists(bak())).toBe(false);
  });

  it("leaves an up-to-date file alone", async () => {
    await fs.writeFile(path.join(tmpDir, "docker-compose.yml"), await template());
    expect(await refreshComposeFile(tmpDir)).toBe("unchanged");
    expect(await fs.pathExists(bak())).toBe(false);
  });
});
