import pc from "picocolors";

export function success(message: string): void {
  console.log(`${pc.green("✔")} ${message}`);
}

export function fail(message: string): void {
  console.error(`${pc.red("✖")} ${message}`);
}

export function warn(message: string): void {
  console.warn(`${pc.yellow("⚠")} ${message}`);
}

export function info(message: string): void {
  console.log(`${pc.cyan("ℹ")} ${message}`);
}

export function hint(message: string): void {
  console.log(pc.dim(`  ${message}`));
}

export { pc };

/**
 * Runs `fn` behind an ora spinner, printing a ✔/✖ line on completion.
 * Falls back to plain log lines when stdout isn't a TTY (CI logs).
 */
export async function withSpinner<T>(text: string, fn: () => Promise<T>): Promise<T> {
  if (!process.stdout.isTTY) {
    console.log(`${pc.cyan("›")} ${text}`);
    try {
      const result = await fn();
      success(text);
      return result;
    } catch (err) {
      fail(text);
      throw err;
    }
  }

  // Loaded lazily: ora imports a JSON module, which Node flags with an
  // ExperimentalWarning during the initial module graph load — deferring the
  // import lets the entry point's warning filter take effect first.
  const { default: ora } = await import("ora");
  const spinner = ora(text).start();
  try {
    const result = await fn();
    spinner.succeed(text);
    return result;
  } catch (err) {
    spinner.fail(text);
    throw err;
  }
}
