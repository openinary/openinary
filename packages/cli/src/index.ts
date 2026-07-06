import { Command } from "commander";
import { buildCreateCommand } from "./commands/create.js";
import { buildRestartCommand } from "./commands/restart.js";
import { buildResetCommand } from "./commands/reset.js";
import { buildStartCommand } from "./commands/start.js";
import { buildStopCommand } from "./commands/stop.js";
import { buildUpgradeCommand } from "./commands/upgrade.js";
import { CLIError } from "./utils/errors.js";
import { fail, hint } from "./utils/logger.js";
import { getCliVersion } from "./utils/pkg.js";
import { setYesMode } from "./utils/prompts.js";

const program = new Command();

program
  .name("openinary")
  .description("Manage a self-hosted Openinary instance")
  .version(getCliVersion(import.meta.url))
  .option("--cwd <dir>", "Project directory", process.cwd())
  .option("-y, --yes", "Skip prompts and accept defaults", false)
  .option("--verbose", "Verbose output", false)
  .hook("preAction", (thisCommand) => {
    setYesMode(Boolean(thisCommand.opts().yes));
  });

program.addCommand(buildCreateCommand());
program.addCommand(buildStartCommand());
program.addCommand(buildStopCommand());
program.addCommand(buildRestartCommand());
program.addCommand(buildUpgradeCommand());
program.addCommand(buildResetCommand());

program.parseAsync(process.argv).catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
  if (err instanceof CLIError && err.hint) hint(err.hint);
  process.exitCode = err instanceof CLIError ? err.exitCode : 1;
});
