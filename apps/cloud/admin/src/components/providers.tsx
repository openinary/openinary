"use client";

import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CACHE_MAX_AGE, persister, queryClient } from "@/utils/orpc";

// sonner draws its own surface rather than using our tokens, so it has to be
// told which theme is live - and only from inside the ThemeProvider.
function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      richColors
      position="bottom-right"
      theme={resolvedTheme === "dark" ? "dark" : "light"}
    />
  );
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    // Same settings as the customer app (apps/web/src/components/providers.tsx):
    // the .dark class carries the palette, and the OS preference decides until
    // the header's toggle is used.
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {/* Persisting rather than plain QueryClientProvider: without it the cache
          dies with the page, and every reload or return to an already-visited
          account refetched four upstreams behind a blank screen. */}
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister, maxAge: CACHE_MAX_AGE }}
      >
        {/* The sidebar's collapsed labels are Tooltips, and this style's
            SidebarProvider no longer supplies the provider itself. */}
        <TooltipProvider>{children}</TooltipProvider>
        <ThemedToaster />
      </PersistQueryClientProvider>
    </ThemeProvider>
  );
}
