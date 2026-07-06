import { execa } from "execa";
import { CLIError } from "../utils/errors.js";
import { HEALTH_POLL_INTERVAL_MS, HEALTH_TIMEOUT_MS } from "../utils/constants.js";

let preflightChecked = false;

/**
 * Verifies Docker is installed, the daemon is running, and Compose v2 is
 * available. Memoized per process since every command needs it once.
 */
export async function preflight(): Promise<void> {
  if (preflightChecked) return;

  try {
    await execa("docker", ["--version"]);
  } catch {
    throw new CLIError("Docker is not installed.", {
      hint: "Install Docker from https://docs.docker.com/get-docker/",
    });
  }

  try {
    await execa("docker", ["info"]);
  } catch {
    const platformHint =
      process.platform === "linux"
        ? "Start it with: sudo systemctl start docker"
        : "Start Docker Desktop and try again.";
    throw new CLIError("Docker daemon is not running.", { hint: platformHint });
  }

  try {
    await execa("docker", ["compose", "version"]);
  } catch {
    throw new CLIError("Docker Compose v2 is required.", {
      hint: 'Use "docker compose" (not the standalone "docker-compose" v1 binary).',
    });
  }

  preflightChecked = true;
}

export interface ComposeOptions {
  stream?: boolean;
}

/**
 * Runs `docker compose` in the given project directory. Output is captured
 * unless `stream` is set (used for --attach / --verbose modes).
 */
export async function compose(
  projectDir: string,
  args: string[],
  opts: ComposeOptions = {}
): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execa("docker", ["compose", ...args], {
      cwd: projectDir,
      stdio: opts.stream ? "inherit" : "pipe",
    });
    return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new CLIError(`docker compose ${args.join(" ")} failed`, { hint: message });
  }
}

export async function composeLogs(
  projectDir: string,
  opts: { tail?: number } = {}
): Promise<string> {
  const args = ["logs"];
  if (opts.tail) args.push("--tail", String(opts.tail));
  try {
    const result = await execa("docker", ["compose", ...args], {
      cwd: projectDir,
      stdio: "pipe",
    });
    return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  } catch {
    return "";
  }
}

/**
 * Polls GET /health until it responds ok, or throws after `timeoutMs`.
 * Works for both "api" and "full" modes since /health is proxied in both.
 */
export async function waitForHealthy(
  port: number,
  timeoutMs: number = HEALTH_TIMEOUT_MS
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const url = `http://localhost:${port}/health`;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch {
      // not up yet, keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, HEALTH_POLL_INTERVAL_MS));
  }

  throw new CLIError(`Services did not become healthy within ${Math.round(timeoutMs / 1000)}s.`, {
    hint: "Run \"docker compose logs\" to see what's wrong.",
  });
}

/** Extracts the once-printed initial API key from container logs, if present. */
export function findApiKeyInLogs(logs: string): string | null {
  const match = logs.match(/API Key:\s*(\S+)/);
  return match ? match[1] : null;
}

export async function isHealthy(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${port}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
