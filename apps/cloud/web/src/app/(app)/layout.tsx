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

  // Hint written by AppShell once the session is known, so the first paint
  // can guess which screen is coming (shell skeleton or sign-in form).
  const signedIn = cookieStore.get("signed_in")?.value === "1";

  return (
    <AppShell sidebarDefaultOpen={sidebarOpen} signedInHint={signedIn}>
      {children}
    </AppShell>
  );
}
