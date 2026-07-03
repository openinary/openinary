import path from "node:path";
import { Command } from "commander";
import fs from "fs-extra";
import { compose, preflight, waitForHealthy } from "../lib/docker.js";
import { fetchChangelog, renderChangelog, sectionsBetween } from "../lib/changelog.js";
import {
  appendMissingVars,
  diffMissingKeys,
  generateAuthSecret,
  parseEnv,
  serializeEnv,
  upsertVar,
} from "../lib/env.js";
import { getProjectPort, requireProject, writeProjectConfig, type Project } from "../lib/project.js";
import { compareVersions, getLatestRelease } from "../lib/versions.js";
import { GITHUB_API_TIMEOUT_MS, REPO } from "../utils/constants.js";
import { CLIError } from "../utils/errors.js";
import { fail, hint, success, withSpinner } from "../utils/logger.js";
import { confirmPrompt, note } from "../utils/prompts.js";

export interface UpgradeOptions {
  yes?: boolean;
  to?: string;
  dryRun?: boolean;
  cwd?: string;
}

async function fetchEnvTemplateAtTag(tag: string): Promise<string | null> {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${REPO}/${tag}/docker.env.example`, {
      signal: AbortSignal.timeout(GITHUB_API_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Adds any env vars introduced upstream since this project was created/upgraded. Non-fatal on failure. */
async function syncEnvVars(project: Project, targetTag: string): Promise<void> {
  const envPath = path.join(project.dir, ".env");
  const currentContent = (await fs.pathExists(envPath)) ? await fs.readFile(envPath, "utf8") : "";
  const templateRaw = await fetchEnvTemplateAtTag(targetTag);
  if (templateRaw === null) {
    hint("Could not fetch the latest env template — skipping env var sync.");
    return;
  }

  const current = parseEnv(currentContent);
  const template = parseEnv(templateRaw);
  const missingKeys = diffMissingKeys(current, template);
  if (missingKeys.length === 0) return;

  let updated = appendMissingVars(current, template, missingKeys);

  for (const key of missingKeys) {
    if (key === "BETTER_AUTH_SECRET") {
      updated = upsertVar(updated, key, generateAuthSecret());
    }
  }

  await fs.writeFile(envPath, serializeEnv(updated));
  hint(`Added new environment variable${missingKeys.length > 1 ? "s" : ""}: ${missingKeys.join(", ")}`);
}

export async function runUpgrade(options: UpgradeOptions): Promise<void> {
  const project = await requireProject(options.cwd ?? process.cwd());
  const current = project.config.version;

  const latest = options.to
    ? { version: options.to, fromFallback: false }
    : await withSpinner("Checking for updates", () => getLatestRelease());

  if (latest.fromFallback) {
    throw new CLIError("Could not reach GitHub — no changes were made.", {
      hint: "Check your network connection and try again.",
    });
  }

  const target = latest.version;
  const isPinned = current !== "latest";

  if (isPinned && compareVersions(current, target) >= 0) {
    success(`Already on ${current}`);
    return;
  }

  const changelogRaw = await fetchChangelog(target);
  const changelogText = changelogRaw
    ? renderChangelog(sectionsBetween(changelogRaw, isPinned ? current : "0.0.0", target))
    : null;

  if (options.dryRun) {
    note(`${isPinned ? current : "unpinned (latest)"} → ${target}`, "Upgrade plan");
    if (changelogText) note(changelogText, "Changelog");
    return;
  }

  const proceed = await confirmPrompt({
    message: isPinned
      ? `Upgrade ${current} → ${target}?`
      : `Pin this project to ${target} (currently unpinned)?`,
    initialValue: true,
  });
  if (!proceed) return;

  await withSpinner("Checking Docker", () => preflight());
  await withSpinner("Syncing environment variables", () => syncEnvVars(project, target));

  const envPath = path.join(project.dir, ".env");
  const envContent = (await fs.pathExists(envPath)) ? await fs.readFile(envPath, "utf8") : "";
  const envLines = parseEnv(envContent);
  await fs.writeFile(envPath, serializeEnv(upsertVar(envLines, "IMAGE_TAG", target)));

  await writeProjectConfig(project.dir, { ...project.config, version: target });

  await withSpinner(`Downloading ${target}`, () => compose(project.dir, ["--profile", project.config.mode, "pull"]));
  await withSpinner("Restarting services", () =>
    compose(project.dir, ["--profile", project.config.mode, "up", "-d"])
  );

  const port = await getProjectPort(project);
  await withSpinner("Waiting for services to become healthy", () => waitForHealthy(port));

  success(`Upgraded to ${target}`);

  if (changelogText) note(changelogText, "Changelog");
}

export function buildUpgradeCommand(): Command {
  return new Command("upgrade")
    .description("Update this project to the latest compatible Openinary version")
    .option("--to <version>", "Upgrade to a specific version instead of the latest")
    .option("--dry-run", "Show what would change without applying it")
    .action(async (opts, command) => {
      const globals = command.optsWithGlobals();
      try {
        await runUpgrade({ ...opts, cwd: globals.cwd, yes: globals.yes });
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
        if (err instanceof CLIError && err.hint) hint(err.hint);
        process.exitCode = err instanceof CLIError ? err.exitCode : 1;
      }
    });
}
