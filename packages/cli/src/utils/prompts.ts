import * as clack from "@clack/prompts";
import { CLIError } from "./errors.js";

const state = { yes: false };

export function setYesMode(value: boolean): void {
  state.yes = value;
}

function nonInteractive(): boolean {
  return (
    state.yes ||
    !process.stdout.isTTY ||
    process.env.CI === "true" ||
    process.env.CI === "1"
  );
}

export function introMessage(title: string): void {
  if (!nonInteractive()) clack.intro(title);
}

export function outroMessage(message: string): void {
  if (!nonInteractive()) clack.outro(message);
  else console.log(message);
}

export function note(message: string, title?: string): void {
  clack.note(message, title);
}

export function cancelAndExit(message = "Cancelled."): never {
  clack.cancel(message);
  process.exit(1);
}

function requireDefault<T>(message: string, defaultValue: T | undefined, hint: string): T {
  if (defaultValue === undefined) {
    throw new CLIError(`Cannot prompt "${message}" in non-interactive mode`, { hint });
  }
  return defaultValue;
}

export async function confirmPrompt(opts: {
  message: string;
  initialValue?: boolean;
}): Promise<boolean> {
  if (nonInteractive()) {
    return requireDefault(
      opts.message,
      opts.initialValue,
      "Pass --yes to accept defaults, or run this command interactively."
    );
  }
  const result = await clack.confirm({ message: opts.message, initialValue: opts.initialValue });
  if (clack.isCancel(result)) cancelAndExit();
  return result;
}

export async function textPrompt(opts: {
  message: string;
  placeholder?: string;
  defaultValue?: string;
  validate?: (value: string | undefined) => string | Error | undefined;
}): Promise<string> {
  if (nonInteractive()) {
    return requireDefault(
      opts.message,
      opts.defaultValue,
      "Pass --yes to accept defaults, or run this command interactively."
    );
  }
  const result = await clack.text({
    message: opts.message,
    placeholder: opts.placeholder,
    defaultValue: opts.defaultValue,
    validate: opts.validate,
  });
  if (clack.isCancel(result)) cancelAndExit();
  return result;
}

export async function passwordPrompt(opts: {
  message: string;
  validate?: (value: string | undefined) => string | Error | undefined;
}): Promise<string> {
  if (nonInteractive()) {
    throw new CLIError(`Cannot prompt "${opts.message}" in non-interactive mode`, {
      hint: "Set the value via flags/environment, or run this command interactively.",
    });
  }
  const result = await clack.password({ message: opts.message, validate: opts.validate });
  if (clack.isCancel(result)) cancelAndExit();
  return result;
}

export async function selectPrompt<T extends string>(opts: {
  message: string;
  options: { value: T; label: string; hint?: string }[];
  initialValue?: T;
}): Promise<T> {
  if (nonInteractive()) {
    return opts.initialValue ?? opts.options[0].value;
  }
  const result = await clack.select<T>({
    message: opts.message,
    options: opts.options as Parameters<typeof clack.select<T>>[0]["options"],
    initialValue: opts.initialValue,
  });
  if (clack.isCancel(result)) cancelAndExit();
  return result;
}

export function isNonInteractive(): boolean {
  return nonInteractive();
}
