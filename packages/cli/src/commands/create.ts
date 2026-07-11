import path from "node:path";
import { Command } from "commander";
import fs from "fs-extra";
import { compose, findApiKeyInLogs, composeLogs, preflight, waitForHealthy } from "../lib/docker.js";
import type { ProjectMode } from "../lib/project.js";
import { writeProjectConfig } from "../lib/project.js";
import { generateApiSecret, generateAuthSecret } from "../lib/env.js";
import { scaffoldFromEmbeddedTemplate, scaffoldFromRemoteTemplate, type StorageChoice } from "../lib/template.js";
import { getLatestRelease } from "../lib/versions.js";
import { DEFAULT_PORT } from "../utils/constants.js";
import { CLIError } from "../utils/errors.js";
import { fail, hint, pc, success, warn, withSpinner } from "../utils/logger.js";
import {
  confirmPrompt,
  introMessage,
  isNonInteractive,
  note,
  outroMessage,
  selectPrompt,
  textPrompt,
} from "../utils/prompts.js";
import { getCliVersion } from "../utils/pkg.js";

export interface CreateOptions {
  apiOnly?: boolean;
  port?: number;
  start?: boolean;
  yes?: boolean;
  template?: string;
  cwd?: string;
}

async function promptStorage(): Promise<StorageChoice | undefined> {
  const choice = await selectPrompt<StorageChoice>({
    message: "Object storage",
    options: [
      { value: "local", label: "Local disk", hint: "recommended for getting started" },
      { value: "s3", label: "Use my own bucket", hint: "S3 / R2" },
    ],
    initialValue: "local",
  });

  return choice === "local" ? undefined : choice;
}

async function ensureTargetDir(targetDir: string): Promise<void> {
  if (!(await fs.pathExists(targetDir))) return;

  const entries = await fs.readdir(targetDir);
  if (entries.length === 0) return;

  const overwrite = await confirmPrompt({
    message: `${targetDir} already exists and is not empty. Continue anyway?`,
    initialValue: false,
  });
  if (!overwrite) {
    throw new CLIError("Aborted — target directory is not empty.");
  }
}

export async function runCreate(dirArg: string | undefined, options: CreateOptions): Promise<void> {
  introMessage(pc.bold("create-openinary"));

  const projectDir = dirArg ?? (await textPrompt({ message: "Project directory", defaultValue: "openinary" }));
  const targetDir = path.resolve(options.cwd ?? process.cwd(), projectDir);
  await ensureTargetDir(targetDir);

  const mode: ProjectMode = options.apiOnly
    ? "api"
    : await selectPrompt<ProjectMode>({
        message: "Setup",
        options: [
          { value: "full", label: "Full stack", hint: "API + web dashboard" },
          { value: "api", label: "API only" },
        ],
        initialValue: "full",
      });

  const storage = isNonInteractive() ? undefined : await promptStorage();

  const port = options.port ?? DEFAULT_PORT;

  const shouldStart =
    options.start ?? (await confirmPrompt({ message: "Start now with Docker?", initialValue: true }));

  let dockerAvailable = true;
  try {
    await withSpinner("Checking Docker", () => preflight());
  } catch (err) {
    dockerAvailable = false;
    if (err instanceof CLIError) {
      warn(err.message);
      if (err.hint) hint(err.hint);
    }
  }

  const release = await withSpinner("Resolving Openinary version", () => getLatestRelease());
  if (release.fromFallback) {
    warn("Could not reach GitHub — pinning to the \"latest\" Docker tag instead of a specific version.");
  }

  await withSpinner("Writing project files", async () => {
    if (options.template) {
      await scaffoldFromRemoteTemplate(targetDir, options.template!);
    } else {
      await scaffoldFromEmbeddedTemplate(targetDir, {
        projectName: path.basename(targetDir),
        mode,
        port,
        authSecret: generateAuthSecret(),
        authUrl: `http://localhost:${port}`,
        apiSecret: generateApiSecret(),
        imageTag: release.version,
        storage,
      });
    }

    await writeProjectConfig(targetDir, {
      name: path.basename(targetDir),
      version: release.version,
      mode,
      cliVersion: getCliVersion(import.meta.url),
      createdAt: new Date().toISOString(),
    });
  });

  if (storage === "s3") {
    warn(`Placeholder S3/R2 credentials were written to ${projectDir}/.env — edit them with your bucket details before starting.`);
  }

  if (shouldStart && dockerAvailable) {
    await withSpinner(`Downloading Openinary ${release.version}`, () =>
      compose(targetDir, ["--profile", mode, "pull"])
    );
    await withSpinner("Starting services", () => compose(targetDir, ["--profile", mode, "up", "-d"]));

    try {
      await withSpinner("Waiting for services to become healthy", () => waitForHealthy(port));
    } catch (err) {
      const logs = await composeLogs(targetDir, { tail: 50 });
      fail(err instanceof Error ? err.message : String(err));
      if (logs) note(logs, "docker compose logs --tail 50");
      throw new CLIError("Services did not start correctly.", {
        hint: `Run "cd ${projectDir} && openinary start --verbose" to retry.`,
      });
    }

    if (mode === "api") {
      const logs = await composeLogs(targetDir, { tail: 100 });
      const apiKey = findApiKeyInLogs(logs);
      if (apiKey) note(`API Key: ${pc.bold(apiKey)}\n\nSave this now — it will not be shown again.`, "Initial API key");
    }

    success(`Openinary is running at http://localhost:${port}`);
  } else if (!dockerAvailable) {
    warn(`Files created — run "cd ${projectDir} && openinary start" once Docker is installed.`);
  } else {
    hint(`Run "cd ${projectDir} && openinary start" when you're ready.`);
  }

  const lines = [
    `cd ${projectDir}`,
    "openinary start     # start services",
    "openinary stop      # stop services",
    "openinary upgrade   # update to the latest version",
  ];
  if (storage === "s3") {
    lines.push(`Edit .env with your bucket credentials, then run "openinary start" (or restart) to apply them.`);
  }
  if (mode === "full") {
    lines.push(`Visit http://localhost:${port}/setup to create your admin account.`);
  }
  note(lines.join("\n"), "Next steps");

  outroMessage("Tip: install the CLI globally with \"npm i -g create-openinary\" to get the \"openinary\" command.");
}

export function buildCreateCommand(): Command {
  return new Command("create")
    .description("Scaffold a new Openinary project")
    .argument("[dir]", "Project directory")
    .option("--api-only", "Scaffold API-only mode (no web dashboard)")
    .option("--port <port>", "Host port", (v) => Number(v))
    .option("--no-start", "Don't start Docker after scaffolding")
    .option("--template <source>", "Fetch a template via giget instead of the built-in one")
    .action(async (dir: string | undefined, opts, command) => {
      const globals = command.optsWithGlobals();
      try {
        await runCreate(dir, { ...opts, cwd: globals.cwd, yes: globals.yes });
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
        if (err instanceof CLIError && err.hint) hint(err.hint);
        process.exitCode = err instanceof CLIError ? err.exitCode : 1;
      }
    });
}
