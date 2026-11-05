import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "late ice · Wilmington",
  description: "Beer league hockey, counted. Snap the scoresheet, get your rating.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.svg", apple: "/icon-192.png" },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "late ice" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#05070B",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
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
