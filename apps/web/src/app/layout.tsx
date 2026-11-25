import type { Metadata } from "next";
import { Geist_Mono, Mona_Sans } from "next/font/google";
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { FieldErrors, Toaster } from "@openinary/ui";
import { ThemeProvider } from "next-themes";
import { QueryProvider } from "@/components/query-provider";
import { WebOpeninaryProvider } from "@/components/web-openinary-provider";
import "./globals.css";

const monaSans = Mona_Sans({
  variable: "--font-mona-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Openinary",
  description: "Media transformation playground",
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html suppressHydrationWarning lang="en">
      <body
        className={`${monaSans.variable} ${geistMono.variable} antialiased`}
      >
        <QueryProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <WebOpeninaryProvider
              apiBaseUrl={process.env.NEXT_PUBLIC_API_BASE_URL || ""}
              transformBaseUrl={process.env.NEXT_PUBLIC_TRANSFORM_BASE_URL}
            >
              <NuqsAdapter>{children}</NuqsAdapter>
              <Toaster />
              <FieldErrors />
            </WebOpeninaryProvider>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
