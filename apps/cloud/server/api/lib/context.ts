import type { Context as HonoContext } from "hono";
import { auth } from "./auth.js";
import type { DeliveryEvent } from "./delivery-log.js";

export type CreateContextOptions = {
  context: HonoContext;
};

/**
 * Structural stand-in for the one Worker binding api/ needs. The real type is
 * the global `Env` from worker-configuration.d.ts, but that global only exists
 * under the Worker's tsconfig - api/** also compiles into the container image,
 * where @cloudflare/workers-types is not in scope, so naming `Env` here would
 * break that build. Describing only what is called keeps both compilers happy.
 */
export type UsageMeterBinding = {
  idFromName(name: string): unknown;
  get(id: unknown): {
    recent(): Promise<{ events: DeliveryEvent[]; pendingCdn: number }>;
    pending(): Promise<number>;
    apiUploadSeen(): Promise<boolean>;
  };
};

/**
 * The bucketId -> owner cache the CDN path reads on every delivery (see
 * readBucketOwner in worker/index.ts). routers/admin.ts writes the `suspended`
 * flag into it, which is what actually stops an account being served - a
 * better-auth ban only blocks sign-in.
 */
export type BucketOwnersBinding = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};

export type Bindings = {
  USAGE_METER: UsageMeterBinding;
  BUCKET_OWNERS: BucketOwnersBinding;
};

export async function createContext({ context }: CreateContextOptions) {
  const headers = context.req.raw.headers;
  const session = await auth.api.getSession({ headers });
  return {
    session,
    // Forwarded so routers can call auth.api.* endpoints that authenticate off
    // the caller's session rather than a server-only userId (routers/api-key.ts).
    headers,
    // Worker bindings. Everything else in api/lib reaches configuration through
    // process.env, but a Durable Object namespace only exists on the binding
    // object - routers/usage.ts needs USAGE_METER to read an account's live
    // delivery log out of the instance that holds it.
    env: context.env as Bindings,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
