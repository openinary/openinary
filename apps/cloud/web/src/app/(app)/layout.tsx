import { cookies } from "next/headers";

import { AppShell } from "@/components/app-shell";

// The route group adds no URL segment: (app)/page.tsx is still "/". It exists
// so every signed-in route shares one shell (session gate, providers, sidebar)
// instead of each page rebuilding it.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return <AppShell sidebarDefaultOpen={sidebarOpen}>{children}</AppShell>;
}
