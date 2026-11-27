import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AppRouter } from "cloud-server/router";

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      // A read the role can't make (a member's API keys, the payment method)
      // is a page detail, not news: the page shows what it can. These mostly
      // race an account switch, firing with the previous account's role
      // before the new one is known. Actions (mutations) still say it.
      if ((error as { code?: unknown }).code === "FORBIDDEN") return;
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
