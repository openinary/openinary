"use client";

import { Toaster } from "@openinary/ui";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";

import { CloudOpeninaryProvider } from "@/components/dashboard-providers";
import { queryClient } from "@/utils/orpc";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <CloudOpeninaryProvider>
          {children}
          {/* MediaGrid renders its bulk-action bar through toast.custom, and
              sonner mounts that JSX in the Toaster's own tree, not where the
              toast was fired. So the bar's "Move to..." menu looks for the
              query client and the Openinary context here. */}
          <Toaster richColors />
        </CloudOpeninaryProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
