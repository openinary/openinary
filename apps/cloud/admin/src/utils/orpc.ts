import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { appRouter } from "../../../server/api/routers/index";

/**
 * How long a restored cache is still worth drawing. Also the gcTime, since a
 * cache that outlives what may read it would be collected before the reload
 * that wanted it.
 */
export const CACHE_MAX_AGE = 60 * 60 * 1000;

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      toast.error(error.message);
    },
  }),
  defaultOptions: {
    queries: {
      // Admin data is read to make a decision about a live account, so it must
      // never be *silently* old - which is not the same as never being old.
      // Pages draw what is cached immediately, say how old it is, and refetch
      // behind it (<Freshness>, src/components/fields.tsx). Thirty seconds is
      // how long looking at the same account twice counts as one look.
      staleTime: 30_000,
      gcTime: CACHE_MAX_AGE,
      refetchOnWindowFocus: true,
    },
  },
});

/**
 * What survives a reload, so F5 and the back button redraw instead of blanking.
 *
 * sessionStorage rather than localStorage, deliberately: this cache holds
 * customer emails, live sessions and Stripe ids, and closing the tab should
 * take them with it rather than leave them on the disk of whatever machine the
 * panel was opened on. Per-tab is still enough for the reload it exists for.
 */
export const persister = createAsyncStoragePersister({
  storage: typeof window === "undefined" ? undefined : window.sessionStorage,
  key: "openinary-admin-cache",
});

export const link = new RPCLink({
  url: `${process.env.NEXT_PUBLIC_SERVER_URL}/api/rpc`,
  fetch(url, options) {
    // The session cookie lives on ".openinary.dev" and this app is a different
    // subdomain, so every call has to opt in to sending it.
    return fetch(url, { ...options, credentials: "include" });
  },
});

export const client: RouterClient<typeof appRouter> = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);

/**
 * The two destructive operations are plain Worker routes, not oRPC procedures:
 * both sweep R2, and the oRPC router compiles without the Worker's bindings
 * (see the note at the top of api/routers/admin.ts).
 */
export async function adminFetch(
  path: string,
  init?: RequestInit,
): Promise<void> {
  const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? `Request failed (${response.status})`);
  }
}
