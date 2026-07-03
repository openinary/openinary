import path from "node:path";
import { Command } from "commander";
import fs from "fs-extra";
import { compose, composeLogs, findApiKeyInLogs, isHealthy, preflight, waitForHealthy } from "../lib/docker.js";
import { getVar, parseEnv, serializeEnv, upsertVar } from "../lib/env.js";
import { requireProject, type Project, type ProjectMode } from "../lib/project.js";
import { DEFAULT_PORT } from "../utils/constants.js";
import { CLIError } from "../utils/errors.js";
import { fail, hint, pc, success, withSpinner } from "../utils/logger.js";
import { note as noteBlock } from "../utils/prompts.js";

export interface StartOptions {
  apiOnly?: boolean;
  attach?: boolean;
  port?: number;
  pull?: boolean;
  cwd?: string;
}

async function resolvePort(project: Project, overridePort?: number): Promise<number> {
  const envPath = path.join(project.dir, ".env");
  const content = (await fs.pathExists(envPath)) ? await fs.readFile(envPath, "utf8") : "";
  const lines = parseEnv(content);

  if (overridePort === undefined) {
    const current = getVar(lines, "OPENINARY_PORT");
    return current ? Number(current) : DEFAULT_PORT;
  }

  const updated = upsertVar(lines, "OPENINARY_PORT", String(overridePort));
  await fs.writeFile(envPath, serializeEnv(updated));
  return overridePort;
}

function resolveMode(project: Project, apiOnly?: boolean): ProjectMode {
  return apiOnly ? "api" : project.config.mode;
}

export async function runStart(options: StartOptions): Promise<void> {
  const project = await requireProject(options.cwd ?? process.cwd());
  await withSpinner("Checking Docker", () => preflight());

  const mode = resolveMode(project, options.apiOnly);
  const port = await resolvePort(project, options.port);

  if (!options.attach && (await isHealthy(port))) {
    success(`Openinary is already running at http://localhost:${port}`);
    return;
  }

  if (options.pull) {
    await withSpinner("Pulling latest images", () => compose(project.dir, ["--profile", mode, "pull"]));
  }

  if (options.attach) {
    hint("Starting in the foreground — press Ctrl+C to stop.");
    await compose(project.dir, ["--profile", mode, "up"], { stream: true });
    return;
  }

  await withSpinner("Starting services", () => compose(project.dir, ["--profile", mode, "up", "-d"]));

  try {
    await withSpinner("Waiting for services to become healthy", () => waitForHealthy(port));
  } catch (err) {
    const logs = await composeLogs(project.dir, { tail: 50 });
    if (logs) noteBlock(logs, "docker compose logs --tail 50");
    throw err;
  }

  if (mode === "api") {
    const logs = await composeLogs(project.dir, { tail: 100 });
    const apiKey = findApiKeyInLogs(logs);
    if (apiKey) noteBlock(`API Key: ${pc.bold(apiKey)}`, "Initial API key");
  }

  success(`Openinary is running at http://localhost:${port}`);
}

export function buildStartCommand(): Command {
  return new Command("start")
    .description("Start Openinary services")
    .option("--api-only", "Start in API-only mode")
    .option("--attach", "Run in the foreground")
    .option("--port <port>", "Host port", (v) => Number(v))
    .option("--pull", "Pull the latest images first")
    .action(async (opts, command) => {
      const globals = command.optsWithGlobals();
      try {
        await runStart({ ...opts, cwd: globals.cwd });
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
        if (err instanceof CLIError && err.hint) hint(err.hint);
        process.exitCode = err instanceof CLIError ? err.exitCode : 1;
      }
    });
}
