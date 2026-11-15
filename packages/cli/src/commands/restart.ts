import { addStartOptions, runStart, type StartOptions } from "./start.js";
import { runStop } from "./stop.js";
import { Command } from "commander";

export async function runRestart(options: StartOptions): Promise<void> {
  await runStop({ cwd: options.cwd });
  await runStart(options);
}

export function buildRestartCommand(): Command {
  return addStartOptions(new Command("restart"))
    .description("Restart Openinary services")
    .action(async (opts, command) => {
      await runRestart({ ...opts, cwd: command.optsWithGlobals().cwd });
    });
}
