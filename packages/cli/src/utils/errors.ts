import { fail, hint } from "./logger.js";

export class CLIError extends Error {
  readonly hint?: string;
  readonly exitCode: number;

  constructor(message: string, options: { hint?: string; exitCode?: number } = {}) {
    super(message);
    this.name = "CLIError";
    this.hint = options.hint;
    this.exitCode = options.exitCode ?? 1;
  }
}

/** The one place a command's failure is printed and turned into an exit code. */
export function reportError(err: unknown): void {
  fail(err instanceof Error ? err.message : String(err));
  if (err instanceof CLIError && err.hint) hint(err.hint);
  process.exitCode = err instanceof CLIError ? err.exitCode : 1;
}
