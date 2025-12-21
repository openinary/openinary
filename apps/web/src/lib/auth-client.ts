import { createAuthClientInstance } from "shared/auth-client";

// Create the auth client for Next.js app
// #region agent log
const clientBaseURL = typeof window !== "undefined" ? window.location.origin : "http://localhost:3001";
if (typeof window !== "undefined") {
  fetch('http://127.0.0.1:7243/ingest/6c024c56-f276-413d-8125-e9a091f8e898',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth-client.ts:4',message:'Auth client baseURL',data:{clientBaseURL,protocol:window.location.protocol,origin:window.location.origin},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
}
// #endregion
export const authClient = createAuthClientInstance(clientBaseURL);

export const { signIn, signOut, signUp, useSession } = authClient;