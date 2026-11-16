import { Command } from "commander";
import { addCreateOptions, runCreate } from "./commands/create.js";
import { buildRestartCommand } from "./commands/restart.js";
import { buildResetCommand } from "./commands/reset.js";
import { buildStartCommand } from "./commands/start.js";
import { buildStopCommand } from "./commands/stop.js";
import { buildUpgradeCommand } from "./commands/upgrade.js";
import { renderBanner } from "./utils/banner.js";
import { reportError } from "./utils/errors.js";
import { getCliVersion } from "./utils/pkg.js";
import { setYesMode } from "./utils/prompts.js";
import { suppressJsonModuleWarning } from "./utils/warnings.js";

suppressJsonModuleWarning();

const program = addCreateOptions(new Command())
  .name("create-openinary")
  .version(getCliVersion(import.meta.url))
  .option("--cwd <dir>", "Directory to scaffold into", process.cwd())
  .option("-y, --yes", "Skip prompts and accept defaults", false)
  .option("--verbose", "Verbose output", false)
  .hook("preAction", (thisCommand) => {
    setYesMode(Boolean(thisCommand.opts().yes));
  })
  .addHelpText("before", () => renderBanner(getCliVersion(import.meta.url)))
  .action(async (dir: string | undefined, opts) => {
    await runCreate(dir, opts);
  });

// Also allow `npx create-openinary start|stop|restart|upgrade|reset ...` so
// managing an existing project doesn't require a global "openinary" install.
program.addCommand(buildStartCommand());
program.addCommand(buildStopCommand());
program.addCommand(buildRestartCommand());
program.addCommand(buildUpgradeCommand());
program.addCommand(buildResetCommand());

program.parseAsync(process.argv).catch(reportError);
