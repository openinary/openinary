import { createAuthClient } from "better-auth/react";
import { apiKeyClient } from "@better-auth/api-key/client";

export const createAuthClientInstance = (baseURL: string) =>
  createAuthClient({
    baseURL,
    fetchOptions: { credentials: "include" },
    plugins: [apiKeyClient()],
  });
