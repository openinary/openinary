import path from "node:path";
import { Command } from "commander";
import fs from "fs-extra";
import {
  compose,
  composeLogs,
  findApiKeyInLogs,
  isHealthy,
  preflight,
  waitForHealthy,
} from "../lib/docker.js";
import { parseEnv, serializeEnv, upsertVar } from "../lib/env.js";
import { getProjectPort, requireProject, type Project } from "../lib/project.js";
import { hint, pc, success, withSpinner } from "../utils/logger.js";
import { note as noteBlock } from "../utils/prompts.js";

export interface StartOptions {
  apiOnly?: boolean;
  attach?: boolean;
  port?: number;
  pull?: boolean;
  cwd?: string;
}

/** --port is remembered in .env for the next start. */
async function resolvePort(project: Project, overridePort?: number): Promise<number> {
  if (overridePort === undefined) return getProjectPort(project);
  const envPath = path.join(project.dir, ".env");
  const content = (await fs.pathExists(envPath))
    ? await fs.readFile(envPath, "utf8")
    : "";
  const updated = upsertVar(parseEnv(content), "OPENINARY_PORT", String(overridePort));
  await fs.writeFile(envPath, serializeEnv(updated));
  return overridePort;
}

export async function runStart(options: StartOptions): Promise<void> {
  const project = await requireProject(options.cwd ?? process.cwd());
  await withSpinner("Checking Docker", () => preflight());

  const mode = options.apiOnly ? "api" : project.config.mode;
  const port = await resolvePort(project, options.port);

  if (!options.attach && (await isHealthy(port))) {
    success(`Openinary is already running at http://localhost:${port}`);
    return;
  }

  if (options.pull) {
    await withSpinner("Pulling latest images", () =>
      compose(project.dir, ["--profile", mode, "pull"]),
    );
  }

  if (options.attach) {
    hint("Starting in the foreground, press Ctrl+C to stop.");
    await compose(project.dir, ["--profile", mode, "up"], { stream: true });
    return;
  }

  await withSpinner("Starting services", () =>
    compose(project.dir, ["--profile", mode, "up", "-d"]),
  );

  try {
    await withSpinner("Waiting for services to become healthy", () =>
      waitForHealthy(port),
    );
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

/** The options `start` and `restart` share. */
export function addStartOptions(command: Command): Command {
  return command
    .option("--api-only", "Start in API-only mode")
    .option("--attach", "Run in the foreground")
    .option("--port <port>", "Host port", (v) => Number(v))
    .option("--pull", "Pull the latest images first");
}

export function buildStartCommand(): Command {
  return addStartOptions(new Command("start"))
    .description("Start Openinary services")
    .action(async (opts, command) => {
      await runStart({ ...opts, cwd: command.optsWithGlobals().cwd });
    });
}
