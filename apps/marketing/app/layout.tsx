import type { Metadata } from "next";
import { MarkPlay } from "@/components/site/mark-play";
import { SmoothScroll } from "@/components/site/smooth-scroll";
import { Geist_Mono, Mona_Sans } from "next/font/google";
import "lenis/dist/lenis.css";
import "../styles/index.css";
import { ThemeProvider } from "next-themes";
import Script from "next/script";
import { SITE_URL } from "@/lib/site";

const monaSans = Mona_Sans({
  variable: "--font-mona",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const description =
  "Open-source, self-hostable alternative to Cloudinary. Upload, transform and deliver images and videos from the edge, on S3, R2 or MinIO.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
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
    <html
      lang="en"
      // The font variables go on <html>: Tailwind sets font-family there, and a
      // variable defined lower down leaves it invalid, so the system font shows.
      className={`${monaSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
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
        className="antialiased"
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <SmoothScroll />
          <MarkPlay />
        </ThemeProvider>
      </body>
    </html>
  );
}
