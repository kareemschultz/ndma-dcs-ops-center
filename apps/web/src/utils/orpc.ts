import { env } from "@ndma-dcs-staff-portal/env/web";
import type { AppRouterClient } from "@ndma-dcs-staff-portal/api/routers/index";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      toast.error(`Error: ${error.message}`, {
        action: {
          label: "retry",
          onClick: query.invalidate,
        },
      });
    },
  }),
});

// Resolve the RPC base URL: use VITE_SERVER_URL in dev, otherwise fall back to
// window.location.origin so the URL is always absolute (new URL() requires this).
const rpcBase =
  env.VITE_SERVER_URL || (typeof window !== "undefined" ? window.location.origin : "");

export const link = new RPCLink({
  url: `${rpcBase}/rpc`,
  fetch(url, options) {
    return fetch(url, {
      ...options,
      credentials: "include",
    });
  },
});

export const client = createORPCClient<AppRouterClient>(link);

export const orpc = createTanstackQueryUtils(client);
