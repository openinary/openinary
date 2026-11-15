import { Command } from "commander";
import { compose, preflight } from "../lib/docker.js";
import { requireProject } from "../lib/project.js";
import { success, withSpinner } from "../utils/logger.js";

export interface StopOptions {
  cwd?: string;
}

// Always runs `down`: a stack that never became healthy still holds its
// containers, and `down` on a stopped stack is a no-op.
export async function runStop(options: StopOptions): Promise<void> {
  const project = await requireProject(options.cwd ?? process.cwd());
  await withSpinner("Checking Docker", () => preflight());
  await withSpinner("Stopping services", () =>
    compose(project.dir, ["--profile", project.config.mode, "down"])
  );
  success("Stopped (data preserved)");
}

export function buildStopCommand(): Command {
  return new Command("stop")
    .description("Stop Openinary services")
    .action(async (_opts, command) => {
      await runStop({ cwd: command.optsWithGlobals().cwd });
    });
}
