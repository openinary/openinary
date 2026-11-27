import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AppRouter } from "cloud-server/router";

// No session (signed out, expired, or not known yet on a first paint): the
// shell answers with the sign-in form, and retrying would only 401 again.
// oRPC throws ORPCError("UNAUTHORIZED"); the plain fetchers throw
// "Request failed with status 401".
const isUnauthorized = (error: Error) =>
  error instanceof ORPCError
    ? error.status === 401
    : error.message.endsWith("status 401");

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (isUnauthorized(error)) return;
      toast.error(`Error: ${error.message}`, {
        action: {
          label: "retry",
          onClick: () => {
            queryClient.invalidateQueries();
          },
        },
      });
    },
  }),
});

export const link = new RPCLink({
  url: `${process.env.NEXT_PUBLIC_SERVER_URL}/api/rpc`,
  fetch(url, options) {
    return fetch(url, {
      ...options,
      credentials: "include",
    });
  },
});

export const client: RouterClient<AppRouter> = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
