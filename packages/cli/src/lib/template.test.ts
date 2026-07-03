import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateAuthSecret } from "./env.js";
import { scaffoldFromEmbeddedTemplate } from "./template.js";

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
      authSecret: generateAuthSecret(),
      authUrl: "http://localhost:3000",
      imageTag: "v0.1.3",
    });

    const entries = (await fs.readdir(tmpDir)).sort();
    expect(entries).toEqual(["README.md", ".env", ".gitignore", "docker-compose.yml"].sort());
  });

  it("writes a BETTER_AUTH_SECRET of at least 32 characters", async () => {
    const secret = generateAuthSecret();
    await scaffoldFromEmbeddedTemplate(tmpDir, {
      projectName: "my-project",
      mode: "full",
      port: 3000,
      authSecret: secret,
      authUrl: "http://localhost:3000",
      imageTag: "v0.1.3",
    });

    const env = await fs.readFile(path.join(tmpDir, ".env"), "utf8");
    const match = env.match(/^BETTER_AUTH_SECRET=(.+)$/m);
    expect(match?.[1]?.length).toBeGreaterThanOrEqual(32);
  });

  it("substitutes the image tag, port, and auth url placeholders", async () => {
    await scaffoldFromEmbeddedTemplate(tmpDir, {
      projectName: "my-project",
      mode: "api",
      port: 4000,
      authSecret: "x".repeat(32),
      authUrl: "http://localhost:4000",
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
      imageTag: "v0.1.3",
    });

    const env = await fs.readFile(path.join(tmpDir, ".env"), "utf8");
    expect(env).toContain("# STORAGE_BUCKET_NAME=your-bucket");
  });

  it("fills in storage vars when provided", async () => {
    await scaffoldFromEmbeddedTemplate(tmpDir, {
      projectName: "my-project",
      mode: "full",
      port: 3000,
      authSecret: "x".repeat(32),
      authUrl: "http://localhost:3000",
      imageTag: "v0.1.3",
      storage: {
        bucketName: "my-bucket",
        region: "auto",
        accessKeyId: "key",
        secretAccessKey: "secret",
        endpoint: "https://example.r2.cloudflarestorage.com",
        publicUrl: "https://cdn.example.com",
      },
    });

    const env = await fs.readFile(path.join(tmpDir, ".env"), "utf8");
    expect(env).toContain("STORAGE_BUCKET_NAME=my-bucket");
    expect(env).not.toContain("# STORAGE_BUCKET_NAME=my-bucket");
  });
});
