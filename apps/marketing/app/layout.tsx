import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "../styles/index.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import Script from "next/script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const description =
  "Open-source, self-hostable alternative to Cloudinary. Upload, transform and deliver images and videos from the edge, on S3, R2 or MinIO.";

export const metadata: Metadata = {
  metadataBase: new URL("https://openinary.dev"),
  title: "Openinary | Open-source, self-hostable alternative to Cloudinary",
  description,
  openGraph: {
    type: "website",
    siteName: "Openinary",
    title: "Openinary | Open-source, self-hostable alternative to Cloudinary",
    description,
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image" },
};
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="preconnect"
          href="https://api.github.com"
          crossOrigin="anonymous"
        />
        <Script
          id="counterscale-script"
          data-site-id="openinary-marketing"
          src="https://counterscale.heysen.workers.dev/tracker.js"
          defer
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          storageKey="openinary-theme"
          enableSystem
          enableColorScheme
          disableTransitionOnChange
        >
          {children}
          <Toaster position="top-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
