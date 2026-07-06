import { Command } from "commander";
import { CLIError } from "../utils/errors.js";
import { fail, hint } from "../utils/logger.js";
import { runStart, type StartOptions } from "./start.js";
import { runStop } from "./stop.js";

export async function runRestart(options: StartOptions): Promise<void> {
  await runStop({ cwd: options.cwd });
  await runStart(options);
}

export function buildRestartCommand(): Command {
  return new Command("restart")
    .description("Restart Openinary services")
    .option("--api-only", "Start in API-only mode")
    .option("--attach", "Run in the foreground")
    .option("--port <port>", "Host port", (v) => Number(v))
    .option("--pull", "Pull the latest images first")
    .action(async (opts, command) => {
      const globals = command.optsWithGlobals();
      try {
        await runRestart({ ...opts, cwd: globals.cwd });
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
        if (err instanceof CLIError && err.hint) hint(err.hint);
        process.exitCode = err instanceof CLIError ? err.exitCode : 1;
      }
    });
}
