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
 * Create a structured logger instance
 * - In development: pretty printed logs with colors
 * - In production: JSON structured logs
 */
const logger = pino({
  level: getLogLevel(),
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

