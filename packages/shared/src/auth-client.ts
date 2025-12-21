import { createAuthClient } from "better-auth/react";
import { apiKeyClient } from "better-auth/client/plugins";

export const createAuthClientInstance = (baseURL: string) => {
  // #region agent log
  if (typeof window !== 'undefined') {
    fetch('http://127.0.0.1:7243/ingest/6c024c56-f276-413d-8125-e9a091f8e898',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth-client.ts:5',message:'Creating auth client instance',data:{baseURL,windowOrigin:window.location.origin,protocol:window.location.protocol},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2,H3'})}).catch(()=>{});
  }
  // #endregion
  
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


