"use client";

import { OpeninaryProvider, Toaster } from "@openinary/ui";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/utils/orpc";
import { ThemeProvider } from "./theme-provider";

// The app's real OpeninaryProvider is DashboardOpeninaryProvider (see
// components/dashboard.tsx), not the bare one below - it needs the signed-in
// account's active bucket id to build the public asset URLs it hands out,
// which means querying a protected endpoint. Every route renders through this
// root layout, including the public marketing site and the login page, so
// that query can't live up here without firing (and 401ing) for signed-out
// visitors too.
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        {children}
        {/* MediaGrid renders its bulk-action bar through toast.custom, and
            sonner mounts that JSX in the Toaster's own tree - not where the
            toast was fired. So the bar's "Move to..." menu (MoveToNavigator ->
            useStorageLevel) looks for the query client and the Openinary
            context here, and threw "useOpeninary must be used inside
            <OpeninaryProvider>" until the Toaster moved inside both. Only
            apiBaseUrl matters for it: it reads the session-gated /storage
            routes, which are bucket-independent, so this provider needs none
            of DashboardOpeninaryProvider's bucket lookup (same apiBaseUrl =
            same query keys, so the two share one cache). */}
        <OpeninaryProvider apiBaseUrl={process.env.NEXT_PUBLIC_SERVER_URL!}>
          <Toaster richColors />
        </OpeninaryProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
