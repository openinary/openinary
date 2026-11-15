import type { Metadata } from "next";
import { Geist_Mono, Mona_Sans } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "../index.css";
import Providers from "@/components/providers";

const monaSans = Mona_Sans({
  variable: "--font-mona-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Openinary Cloud",
  description: "Openinary Cloud",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${monaSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <NuqsAdapter>{children}</NuqsAdapter>
        </Providers>
      </body>
    </html>
  );
}
