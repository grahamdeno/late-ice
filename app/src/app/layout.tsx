import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  metadataBase: new URL("https://late-ice.tangomike.app"),
  title: "Late Ice",
  description: "Every game counts. Even the 11:15. Beer league hockey, counted.",
  manifest: "/manifest.webmanifest",
  // What a texted link shows: name, one line, and the card picture.
  openGraph: {
    title: "Late Ice",
    description: "Every game counts. Even the 11:15. Beer league hockey, counted.",
    siteName: "Late Ice",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Late Ice. Every game counts. Even the 11:15." }],
  },
  twitter: { card: "summary_large_image", title: "Late Ice", description: "Every game counts. Even the 11:15. Beer league hockey, counted.", images: ["/og.png"] },
  // Closed pilot: stay out of search results. People find it through an invite.
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Late Ice" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f5f8" },
    { media: "(prefers-color-scheme: dark)", color: "#05070B" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply the saved look before first paint so the page never flashes the wrong colors. */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("lateice.theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}` }} />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://api.fontshare.com/v2/css?f[]=satoshi@500,700,900&display=swap" rel="stylesheet" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
