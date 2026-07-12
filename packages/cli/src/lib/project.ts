import path from "node:path";
import fs from "fs-extra";
import { CLIError } from "../utils/errors.js";
import { confirmPrompt } from "../utils/prompts.js";
import { DEFAULT_PORT, PROJECT_CONFIG_FILE } from "../utils/constants.js";
import { getVar, parseEnv } from "./env.js";

export type ProjectMode = "full" | "api";

export interface ProjectConfig {
  name: string;
  version: string;
  mode: ProjectMode;
  cliVersion: string;
  createdAt: string;
}

export interface Project {
  dir: string;
  config: ProjectConfig;
}

export function projectConfigPath(dir: string): string {
  return path.join(dir, PROJECT_CONFIG_FILE);
}

export async function loadProjectConfig(dir: string): Promise<ProjectConfig | null> {
  const configPath = projectConfigPath(dir);
  if (!(await fs.pathExists(configPath))) return null;
  try {
    return (await fs.readJson(configPath)) as ProjectConfig;
  } catch {
    throw new CLIError(`Could not parse ${PROJECT_CONFIG_FILE}`, {
      hint: `Check that ${configPath} is valid JSON.`,
    });
  }
}

export async function writeProjectConfig(dir: string, config: ProjectConfig): Promise<void> {
  await fs.writeJson(projectConfigPath(dir), config, { spaces: 2 });
}

/** Walks up from `cwd` looking for an openinary.json marker. */
export async function findProject(cwd: string): Promise<Project | null> {
  let dir = path.resolve(cwd);

  while (true) {
    const config = await loadProjectConfig(dir);
    if (config) return { dir, config };

    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Heuristic for directories that look like an Openinary project but predate
 * the CLI (e.g. a manually set-up docker-compose.yml + .env). Only checks
 * the exact directory given, not ancestors.
 *
 * Guards against matching the Openinary monorepo's own checkout: its root
 * docker-compose.yml + .env would otherwise look exactly like a deployed
 * project, and adopting it would let a later "reset" run `docker compose
 * down -v` against a contributor's real dev stack.
 */
async function detectAdoptable(dir: string): Promise<ProjectConfig | null> {
  const composePath = path.join(dir, "docker-compose.yml");
  const envPath = path.join(dir, ".env");

  if (!(await fs.pathExists(composePath)) || !(await fs.pathExists(envPath))) return null;
  if (await fs.pathExists(path.join(dir, "pnpm-workspace.yaml"))) return null;
  if (await fs.pathExists(path.join(dir, "turbo.json"))) return null;

  const composeText = await fs.readFile(composePath, "utf8");
  if (!composeText.includes("openinary/openinary")) return null;

  const envText = await fs.readFile(envPath, "utf8");
  const imageTagMatch = envText.match(/^IMAGE_TAG=(.+)$/m);
  const modeMatch = composeText.match(/profiles:\s*\["full"\]/);

  return {
    name: path.basename(dir),
    version: imageTagMatch?.[1]?.trim() || "latest",
    mode: modeMatch ? "full" : "api",
    cliVersion: "adopted",
    createdAt: new Date().toISOString(),
  };
}

/**
 * Locates the Openinary project for `cwd`, offering to adopt an existing
 * unmanaged docker-compose setup found directly in `cwd`. Throws a CLIError
 * if no project can be found or adopted.
 */
export async function requireProject(cwd: string): Promise<Project> {
  const existing = await findProject(cwd);
  if (existing) return existing;

  const resolvedCwd = path.resolve(cwd);
  const candidate = await detectAdoptable(resolvedCwd);
  if (candidate) {
    const shouldAdopt = await confirmPrompt({
      message: `Found an existing Openinary setup in ${resolvedCwd}, adopt it as a managed project?`,
      initialValue: true,
    });
    if (shouldAdopt) {
      await writeProjectConfig(resolvedCwd, candidate);
      return { dir: resolvedCwd, config: candidate };
    }
  }

  throw new CLIError("No Openinary project found.", {
    hint: 'Run "pnpm create openinary" to create one, or cd into an existing project.',
  });
}

/** Reads the configured host port from the project's .env, defaulting to DEFAULT_PORT. */
export async function getProjectPort(project: Project): Promise<number> {
  const envPath = path.join(project.dir, ".env");
  if (!(await fs.pathExists(envPath))) return DEFAULT_PORT;

  const content = await fs.readFile(envPath, "utf8");
  const value = getVar(parseEnv(content), "OPENINARY_PORT");
  return value ? Number(value) : DEFAULT_PORT;
}
