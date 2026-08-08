"use client";

import * as React from "react";

export type OpeninaryFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface OpeninaryConfig {
  /** No trailing slash. e.g. "https://media.example.com/api" or "/api" */
  apiBaseUrl: string;
  /** Base for /t/ transformation URLs. No trailing slash. */
  transformBaseUrl: string;
  /** Every request the package makes goes through this. */
  fetch: OpeninaryFetch;
}

export interface OpeninaryProviderProps {
  apiBaseUrl: string;
  /** Defaults to apiBaseUrl with a trailing "/api" segment stripped. */
  transformBaseUrl?: string;
  /** Override to attach auth headers, retries, tracing. Defaults to
   *  `credentials: "include"`, matching the dashboard's current behaviour.
   *  Cannot be passed as a prop from a Server Component — functions aren't
   *  serializable across the RSC boundary. */
  fetch?: OpeninaryFetch;
  children: React.ReactNode;
}

const OpeninaryContext = React.createContext<OpeninaryConfig | null>(null);

const stripSlash = (s: string) => s.replace(/\/+$/, "");

export function OpeninaryProvider({
  apiBaseUrl,
  transformBaseUrl,
  fetch: fetchImpl,
  children,
}: OpeninaryProviderProps) {
  const value = React.useMemo<OpeninaryConfig>(
    () => ({
      apiBaseUrl: stripSlash(apiBaseUrl),
      transformBaseUrl: stripSlash(
        transformBaseUrl ?? apiBaseUrl.replace(/\/api$/, ""),
      ),
      fetch:
        fetchImpl ??
        ((input, init) =>
          globalThis.fetch(input, { credentials: "include", ...init })),
    }),
    [apiBaseUrl, transformBaseUrl, fetchImpl],
  );

  return (
    <OpeninaryContext.Provider value={value}>
      {children}
    </OpeninaryContext.Provider>
  );
}

export function useOpeninary(): OpeninaryConfig {
  const ctx = React.useContext(OpeninaryContext);
  if (!ctx) {
    throw new Error(
      "useOpeninary must be used inside <OpeninaryProvider>. " +
        "Wrap your app: <OpeninaryProvider apiBaseUrl={...}>…</OpeninaryProvider>",
    );
  }
  return ctx;
}
