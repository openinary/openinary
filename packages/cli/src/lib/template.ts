import path from "node:path";
import fs from "fs-extra";
import { downloadTemplate } from "giget";
import { getPackageRoot } from "../utils/pkg.js";
import type { ProjectMode } from "./project.js";

/** Locates the bundled `templates/` directory relative to the package root. */
export function resolveTemplatesDir(): string {
  return path.join(getPackageRoot(import.meta.url), "templates");
}

export interface StorageVars {
  bucketName: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  publicUrl: string;
}

export interface ScaffoldOptions {
  projectName: string;
  mode: ProjectMode;
  port: number;
  authSecret: string;
  authUrl: string;
  imageTag: string;
  storage?: StorageVars;
}

function renderStorageBlock(storage?: StorageVars): string {
  if (!storage) {
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
    `STORAGE_BUCKET_NAME=${storage.bucketName}`,
    `STORAGE_REGION=${storage.region}`,
    `STORAGE_ACCESS_KEY_ID=${storage.accessKeyId}`,
    `STORAGE_SECRET_ACCESS_KEY=${storage.secretAccessKey}`,
    `STORAGE_ENDPOINT=${storage.endpoint}`,
    `STORAGE_PUBLIC_URL=${storage.publicUrl}`,
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
