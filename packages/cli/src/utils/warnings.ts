/**
 * Node prints an ExperimentalWarning when a dependency imports a JSON module
 * (ora does, via cli-spinners). Silence that specific warning; every other
 * warning is re-dispatched to Node's default handlers so their formatting
 * and --trace-warnings behavior are preserved.
 */
export function suppressJsonModuleWarning(): void {
  const defaultListeners = process.listeners("warning");
  process.removeAllListeners("warning");
  process.on("warning", (warning) => {
    if (warning.name === "ExperimentalWarning" && warning.message.includes("JSON modules")) {
      return;
    }
    for (const listener of defaultListeners) listener(warning);
  });
}
