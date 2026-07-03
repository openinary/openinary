import { Command } from "commander";
import { compose, isHealthy, preflight } from "../lib/docker.js";
import { getProjectPort, requireProject } from "../lib/project.js";
import { CLIError } from "../utils/errors.js";
import { fail, hint, success, withSpinner } from "../utils/logger.js";

export interface StopOptions {
  cwd?: string;
}

export async function runStop(options: StopOptions): Promise<void> {
  const project = await requireProject(options.cwd ?? process.cwd());
  await withSpinner("Checking Docker", () => preflight());

  const port = await getProjectPort(project);
  if (!(await isHealthy(port))) {
    success("Nothing to stop");
    return;
  }

  await withSpinner("Stopping services", () =>
    compose(project.dir, ["--profile", project.config.mode, "down"])
  );
  success("Stopped (data preserved)");
}

export function buildStopCommand(): Command {
  return new Command("stop")
    .description("Stop Openinary services")
    .action(async (opts, command) => {
      const globals = command.optsWithGlobals();
      try {
        await runStop({ cwd: globals.cwd });
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
        if (err instanceof CLIError && err.hint) hint(err.hint);
        process.exitCode = err instanceof CLIError ? err.exitCode : 1;
      }
    });
}
