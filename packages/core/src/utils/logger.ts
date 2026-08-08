import pino from "pino";

/**
 * Get log level from environment variable
 * Defaults to 'info' in production, 'debug' in development
 */
function getLogLevel(): string {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  const nodeEnv = process.env.NODE_ENV?.toLowerCase() || "development";

  if (envLevel) {
    return envLevel;
  }

  // Default levels by environment
  if (nodeEnv === "production") {
    return "info";
  }
  return "debug";
}

/**
 * Serialize any error value into a plain object that survives JSON.stringify.
 *
 * Problem: Error.message / Error.stack / Error.name are non-enumerable, so
 * JSON.stringify(new Error('x')) === '{}'. pino's transport worker thread
 * uses structuredClone / JSON serialization internally, which drops those
 * properties even when stdSerializers are configured.
 *
 * Solution: always call serializeError() before passing an error to pino so
 * the resulting object only contains plain enumerable string fields.
 */
export function serializeError(error: unknown): Record<string, unknown> {
  if (error === null || error === undefined) {
    return { message: String(error) };
  }
  if (error instanceof Error) {
    const obj: Record<string, unknown> = {
      type: error.constructor?.name ?? "Error",
      message: error.message,
      stack: error.stack,
    };
    // Capture any extra enumerable properties (e.g. `code` on fs errors)
    for (const key of Object.keys(error)) {
      if (!(key in obj)) {
        obj[key] = (error as any)[key];
      }
    }
    return obj;
  }
  if (typeof error === "object") {
    return { ...(error as object) };
  }
  return { message: String(error) };
}

/**
 * Create a structured logger instance
 * - In development: pretty printed logs with colors
 * - In production: JSON structured logs
 */
const logger = pino({
  level: getLogLevel(),
  // stdSerializers covers the JSON transport (production).
  // In development (pino-pretty worker thread) we also call serializeError()
  // explicitly at every log site to guarantee visibility.
  serializers: {
    error: pino.stdSerializers.err,
    err: pino.stdSerializers.err,
  },
  transport:
    process.env.NODE_ENV === "production"
      ? undefined // Use default JSON output in production
      : {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
            singleLine: false,
          },
        },
  base: {
    env: process.env.NODE_ENV || "development",
  },
});

export default logger;
