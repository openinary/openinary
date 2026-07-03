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
