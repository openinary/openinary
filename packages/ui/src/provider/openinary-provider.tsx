"use client";

import * as React from "react";

export type OpeninaryFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface OpeninaryConfig {
  /** No trailing slash. e.g. "https://media.example.com/api" or "/api" */
  apiBaseUrl: string;
  /** Base for /t/ transformation URLs. No trailing slash. Null while the
   *  host app cannot know it yet: nothing is built on it until it is set. */
  transformBaseUrl: string | null;
  /** Every request the package makes goes through this. */
  fetch: OpeninaryFetch;
  /**
   * Browse and download only: no upload, new folder, rename, move or delete
   * anywhere in the package. UX only; the API refuses the writes either way.
   */
  readOnly: boolean;
}

export interface OpeninaryProviderProps {
  apiBaseUrl: string;
  /** Defaults to apiBaseUrl with a trailing "/api" segment stripped. Pass
   *  null for "not known yet" (e.g. it depends on a request still in flight):
   *  thumbnails and delivery URLs wait instead of pointing somewhere wrong. */
  transformBaseUrl?: string | null;
  /** Override to attach auth headers, retries, tracing. Defaults to
   *  `credentials: "include"`, matching the dashboard's current behaviour.
   *  Cannot be passed as a prop from a Server Component — functions aren't
   *  serializable across the RSC boundary. */
  fetch?: OpeninaryFetch;
  /** Hide every control that changes media (a read-only role). Default false. */
  readOnly?: boolean;
  children: React.ReactNode;
}

const OpeninaryContext = React.createContext<OpeninaryConfig | null>(null);

const stripSlash = (s: string) => s.replace(/\/+$/, "");

export function OpeninaryProvider({
  apiBaseUrl,
  transformBaseUrl,
  fetch: fetchImpl,
  readOnly = false,
  children,
}: OpeninaryProviderProps) {
  const value = React.useMemo<OpeninaryConfig>(
    () => ({
      apiBaseUrl: stripSlash(apiBaseUrl),
      transformBaseUrl:
        transformBaseUrl === null
          ? null
          : stripSlash(transformBaseUrl ?? apiBaseUrl.replace(/\/api$/, "")),
      fetch:
        fetchImpl ??
        ((input, init) =>
          globalThis.fetch(input, { credentials: "include", ...init })),
      readOnly,
    }),
    [apiBaseUrl, transformBaseUrl, fetchImpl, readOnly],
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
