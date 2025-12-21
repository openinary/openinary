import { createAuthClient } from "better-auth/react";
import { apiKeyClient } from "better-auth/client/plugins";

export const createAuthClientInstance = (baseURL: string) => {
  return createAuthClient({
    baseURL,
    fetchOptions: {
      credentials: "include",
    },
    plugins: [apiKeyClient()],
  });
};

// Export a factory function instead of a single instance
// This allows each app to create its own client with the appropriate baseURL
export const authClient = {
  create: createAuthClientInstance,
};


