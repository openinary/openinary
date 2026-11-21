"use client";

import { OpeninaryProvider } from "@openinary/ui";
import { can } from "shared/permissions";

import { useRole } from "@/lib/auth-client";

/**
 * OpeninaryProvider with the session's role applied: a viewer gets the media
 * library read-only (no upload, new folder, rename, move or delete). Writable
 * until the role is known, since nearly everyone can write and the API refuses
 * a viewer's write anyway; hiding controls only once we know saves everyone
 * else a flash of them appearing.
 */
export function WebOpeninaryProvider({
  apiBaseUrl,
  transformBaseUrl,
  children,
}: {
  apiBaseUrl: string;
  transformBaseUrl?: string;
  children: React.ReactNode;
}) {
  const role = useRole();
  const readOnly = role !== undefined && !can(role, "media:write");

  return (
    <OpeninaryProvider
      apiBaseUrl={apiBaseUrl}
      transformBaseUrl={transformBaseUrl}
      readOnly={readOnly}
    >
      {children}
    </OpeninaryProvider>
  );
}
