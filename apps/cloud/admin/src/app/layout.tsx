import type { Metadata } from "next";
import { Geist } from "next/font/google";
import type * as React from "react";
import { AppSidebar } from "@/components/app-sidebar";
import Providers from "@/components/providers";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import "../index.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

// No gate component here: src/middleware.ts refuses anyone but the
// administrator before this ever renders, so everything below is written for a
// reader who is already known to be allowed in.

export const metadata: Metadata = {
  title: "Openinary Admin",
  description: "Account administration",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // The font classes sit on <body>, not <html>: next-themes writes the
    // `dark` class onto <html> from a pre-hydration script, and a className
    // React also owns there is asking for the two to fight.
    <html lang="en" suppressHydrationWarning>
      <body className={cn("font-sans antialiased", geist.variable)}>
        <Providers>
          <SidebarProvider
            style={
              {
                "--sidebar-width": "calc(var(--spacing) * 60)",
                "--header-height": "calc(var(--spacing) * 12)",
              } as React.CSSProperties
            }
          >
            <AppSidebar variant="inset" />
            <SidebarInset>
              <SiteHeader />
              <main className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
                {children}
              </main>
            </SidebarInset>
          </SidebarProvider>
        </Providers>
      </body>
    </html>
  );
}
