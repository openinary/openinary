import { createHash } from "node:crypto";
import path from "node:path";
import fs from "fs-extra";
import { downloadTemplate } from "giget";
import { getPackageRoot } from "../utils/pkg.js";
import type { ProjectMode } from "./project.js";

/** Locates the bundled `templates/` directory relative to the package root. */
export function resolveTemplatesDir(): string {
  return path.join(getPackageRoot(import.meta.url), "templates");
}

export type StorageChoice = "local" | "s3";

export interface ScaffoldOptions {
  projectName: string;
  mode: ProjectMode;
  port: number;
  authSecret: string;
  authUrl: string;
  apiSecret: string;
  imageTag: string;
  storage?: StorageChoice;
}

function renderStorageBlock(storage?: StorageChoice): string {
  if (storage !== "s3") {
    return [
      "# STORAGE_BUCKET_NAME=your-bucket",
      "# STORAGE_REGION=auto",
      "# STORAGE_ACCESS_KEY_ID=your-access-key-id",
      "# STORAGE_SECRET_ACCESS_KEY=your-secret-access-key",
      "# STORAGE_ENDPOINT=https://your-account.r2.cloudflarestorage.com",
      "# STORAGE_PUBLIC_URL=https://your-bucket.example.com",
    ].join("\n");
  }

  return [
    "STORAGE_BUCKET_NAME=your-bucket",
    "STORAGE_REGION=auto",
    "STORAGE_ACCESS_KEY_ID=your-access-key-id",
    "STORAGE_SECRET_ACCESS_KEY=your-secret-access-key",
    "STORAGE_ENDPOINT=https://your-account.r2.cloudflarestorage.com",
    "STORAGE_PUBLIC_URL=https://your-bucket.example.com",
  ].join("\n");
}

function applyPlaceholders(content: string, replacements: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

/** Copies the embedded project template into `targetDir`, substituting placeholders. */
export async function scaffoldFromEmbeddedTemplate(
  targetDir: string,
  opts: ScaffoldOptions
): Promise<void> {
  const templatesDir = resolveTemplatesDir();
  const sourceDir = path.join(templatesDir, "project");

  await fs.ensureDir(targetDir);
  await fs.copy(path.join(sourceDir, "docker-compose.yml"), path.join(targetDir, "docker-compose.yml"));
  await fs.copy(path.join(sourceDir, "gitignore"), path.join(targetDir, ".gitignore"));

  const envTemplate = await fs.readFile(path.join(sourceDir, "env.template"), "utf8");
  const env = applyPlaceholders(envTemplate, {
    IMAGE_TAG: opts.imageTag,
    AUTH_SECRET: opts.authSecret,
    AUTH_URL: opts.authUrl,
    API_SECRET: opts.apiSecret,
    PORT: String(opts.port),
    STORAGE_VARS: renderStorageBlock(opts.storage),
  });
  await fs.writeFile(path.join(targetDir, ".env"), env);

  const readmeTemplate = await fs.readFile(path.join(sourceDir, "README.md"), "utf8");
  const readme = applyPlaceholders(readmeTemplate, {
    PROJECT_NAME: opts.projectName,
    PORT: String(opts.port),
  });
  await fs.writeFile(path.join(targetDir, "README.md"), readme);
}

/** Escape hatch for `create --template <giget-source>` (e.g. examples, community templates). */
export async function scaffoldFromRemoteTemplate(targetDir: string, source: string): Promise<void> {
  await downloadTemplate(source, { dir: targetDir, force: true });
}

/**
 * sha256 of every docker-compose.yml the CLI has shipped, current one included
 * (a test enforces that). A project file matching one of these was never
 * edited by hand.
 */
export const KNOWN_COMPOSE_TEMPLATES = new Set([
  "879f7101eef5a2d67b6c61f42c1cbe09e882f1f23b0d3cddca55b88a6e1ef065", // 4b69b38
  "08fc4e2d631a4a49b771818d681c5a95ec592333f049ba2891691bfb529f1b62", // 2d9f8cf
  "da4d198034aff315861aac22ae0e7018638c0e114e51effac3020ea6a3a6ad10", // env_file: .env
]);

export const sha256 = (text: string) =>
  createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");

export type ComposeRefresh = "unchanged" | "refreshed" | "kept-edited";

/**
 * Brings a project's docker-compose.yml up to the bundled template when it is
 * one the CLI shipped, keeping the old file as docker-compose.yml.bak. A file
 * matching no shipped template holds hand edits (volumes, ports, labels), so
 * it is left in place and the template is written next to it as
 * docker-compose.yml.new ("kept-edited"): replacing it could restart the
 * stack on an empty volume.
 */
export async function refreshComposeFile(dir: string): Promise<ComposeRefresh> {
  const target = path.join(dir, "docker-compose.yml");
  const next = await fs.readFile(
    path.join(resolveTemplatesDir(), "project", "docker-compose.yml"),
    "utf8",
  );
  const current = (await fs.pathExists(target)) ? await fs.readFile(target, "utf8") : null;
  if (current !== null && sha256(current) === sha256(next)) return "unchanged";

  if (current !== null && !KNOWN_COMPOSE_TEMPLATES.has(sha256(current))) {
    await fs.writeFile(`${target}.new`, next);
    return "kept-edited";
  }
  if (current !== null) await fs.writeFile(`${target}.bak`, current);
  await fs.writeFile(target, next);
  return "refreshed";
}
