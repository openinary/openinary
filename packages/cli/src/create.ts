import { Command } from "commander";
import { runCreate } from "./commands/create.js";
import { buildRestartCommand } from "./commands/restart.js";
import { buildResetCommand } from "./commands/reset.js";
import { buildStartCommand } from "./commands/start.js";
import { buildStopCommand } from "./commands/stop.js";
import { buildUpgradeCommand } from "./commands/upgrade.js";
import { renderBanner } from "./utils/banner.js";
import { CLIError } from "./utils/errors.js";
import { fail, hint } from "./utils/logger.js";
import { getCliVersion } from "./utils/pkg.js";
import { setYesMode } from "./utils/prompts.js";
import { suppressJsonModuleWarning } from "./utils/warnings.js";

suppressJsonModuleWarning();

const program = new Command();

program
  .name("create-openinary")
  .description("Scaffold a new Openinary project")
  .version(getCliVersion(import.meta.url))
  .argument("[dir]", "Project directory")
  .option("--api-only", "Scaffold API-only mode (no web dashboard)")
  .option("--port <port>", "Host port", (v) => Number(v))
  .option("--no-start", "Don't start Docker after scaffolding")
  .option("--template <source>", "Fetch a template via giget instead of the built-in one")
  .option("--cwd <dir>", "Directory to scaffold into", process.cwd())
  .option("-y, --yes", "Skip prompts and accept defaults", false)
  .option("--verbose", "Verbose output", false)
  .hook("preAction", (thisCommand) => {
    setYesMode(Boolean(thisCommand.opts().yes));
  })
  .addHelpText("before", () => renderBanner(getCliVersion(import.meta.url)))
  .action(async (dir: string | undefined, opts) => {
    try {
      await runCreate(dir, { ...opts, cwd: opts.cwd, yes: opts.yes });
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
      if (err instanceof CLIError && err.hint) hint(err.hint);
      process.exitCode = err instanceof CLIError ? err.exitCode : 1;
    }
  });

// Also allow `npx create-openinary start|stop|restart|upgrade|reset ...` so
// managing an existing project doesn't require a global "openinary" install.
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
