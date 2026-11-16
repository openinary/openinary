import type { auth } from "../lib/auth.js";
import type { Bindings } from "../bindings.js";

export type Context = {
  session: Awaited<ReturnType<typeof auth.api.getSession>>;
  /**
   * Forwarded so routers can call auth.api.* endpoints that authenticate off
   * the caller's session rather than a server-only userId (rpc/api-key.ts).
   */
  headers: Headers;
  env: Bindings;
};
