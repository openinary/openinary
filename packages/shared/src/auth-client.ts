import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";
import { apiKeyClient } from "@better-auth/api-key/client";
import { accessControl, roles } from "./access-control";

export const createAuthClientInstance = (baseURL: string) =>
  createAuthClient({
    baseURL,
    fetchOptions: { credentials: "include" },
    // adminClient types `user.role` / `user.banned` on the session and adds
    // authClient.admin.* (list users, set role, ban, remove, create). Same
    // roles as the server's admin plugin, so the two agree on who may call it.
    plugins: [apiKeyClient(), adminClient({ ac: accessControl, roles })],
  });
