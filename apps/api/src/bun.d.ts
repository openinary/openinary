/**
 * Type definitions for Bun runtime
 * These types are available when running with Bun
 */

interface BunServeOptions {
  fetch: (request: Request) => Response | Promise<Response>;
  port?: number;
  hostname?: string;
  development?: boolean;
  error?: (error: Error) => Response | Promise<Response>;
}

interface BunServeResult {
  port: number;
  hostname: string;
  stop(): void;
}

declare const Bun: {
  serve(options: BunServeOptions): BunServeResult;
};

