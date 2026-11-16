import type { DeliveryEvent } from "./lib/delivery-log.js";
import type { OwnerKv } from "./owner-cache.js";

/**
 * The Worker bindings the routers use, described by what they call. The
 * routers are also type-checked by apps/cloud/web and apps/cloud/admin through
 * the "cloud-server/router" type export, where the wrangler-generated `Env`
 * and @cloudflare/workers-types are not in scope. worker/app.ts passes the
 * real `Env` in without a cast, so a binding that stops matching this shape
 * fails the Worker's type-check.
 */
export type Bindings = {
  USAGE_METER: {
    idFromName(name: string): unknown;
    get(id: unknown): {
      recent(): Promise<{ events: DeliveryEvent[]; pendingCdn: number }>;
      pending(): Promise<number>;
      apiUploadSeen(): Promise<boolean>;
      onboarded(): Promise<boolean>;
      markOnboarded(): Promise<void>;
    };
  };
  BUCKET_OWNERS: OwnerKv;
};
