import { Command } from "commander";
import { compose, preflight, waitForHealthy } from "../lib/docker.js";
import { getProjectPort, requireProject } from "../lib/project.js";
import { CLIError } from "../utils/errors.js";
import { fail, hint, pc, success, warn, withSpinner } from "../utils/logger.js";
import { cancelAndExit, isNonInteractive, note, textPrompt } from "../utils/prompts.js";

export interface ResetOptions {
  force?: boolean;
  cwd?: string;
}

export async function runReset(options: ResetOptions): Promise<void> {
  const project = await requireProject(options.cwd ?? process.cwd());

  note(
    [
      `This will permanently delete, for project "${project.config.name}":`,
      "  • the local database (accounts, API keys)",
      "  • uploaded files",
      "  • the processing cache",
      "",
      "Everything will then be recreated from scratch.",
    ].join("\n"),
    pc.red("Danger zone")
  );

  if (!options.force) {
    if (isNonInteractive()) {
      throw new CLIError("Cannot confirm reset in non-interactive mode.", {
        hint: "Pass --force to skip confirmation (dangerous, use in CI only).",
      });
    }
    const typed = await textPrompt({
      message: `Type the project name (${project.config.name}) to confirm`,
    });
    if (typed !== project.config.name) {
      cancelAndExit("Names didn't match, nothing was deleted.");
    }
  } else {
    warn("--force passed, skipping confirmation.");
  }

  await withSpinner("Checking Docker", () => preflight());
  await withSpinner("Deleting data", () =>
    compose(project.dir, ["--profile", project.config.mode, "down", "-v"])
  );
  await withSpinner("Recreating services", () =>
    compose(project.dir, ["--profile", project.config.mode, "up", "-d"])
  );

  const port = await getProjectPort(project);
  await withSpinner("Waiting for services to become healthy", () => waitForHealthy(port));

  success("Fresh instance ready");
  hint(`Visit http://localhost:${port}/setup to recreate your admin account.`);
}

export function buildResetCommand(): Command {
  return new Command("reset")
    .description("Delete all local data and recreate the instance from scratch")
    .option("--force", "Skip the confirmation prompt (dangerous — use in CI only)")
    .action(async (opts, command) => {
      const globals = command.optsWithGlobals();
      try {
        await runReset({ ...opts, cwd: globals.cwd });
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
        if (err instanceof CLIError && err.hint) hint(err.hint);
        process.exitCode = err instanceof CLIError ? err.exitCode : 1;
      }
    });
}
