import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { headers } from "next/headers";
import { Providers } from "./providers";

const satoshi = localFont({
  src: [
    { path: "../fonts/Satoshi-Medium.woff2", weight: "500", style: "normal" },
    { path: "../fonts/Satoshi-Bold.woff2", weight: "700", style: "normal" },
    { path: "../fonts/Satoshi-Black.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-satoshi",
  display: "swap",
});

// This Next version's next/font/google catalog exports Big Shoulders, a different family.
// The file below is the Latin Big Shoulders Display face from Google Fonts.
const bigShoulders = localFont({
  src: "../fonts/BigShouldersDisplay-latin.woff2",
  weight: "700 900",
  style: "normal",
  variable: "--font-display-face",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://late-ice.tangomike.app"),
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The website renders bare: no app shell, no tab bar, no install prompt.
  const site = (await headers()).get("x-li-site") === "1";
  return (
    <html lang="en" className={`${satoshi.variable} ${bigShoulders.variable}`} suppressHydrationWarning>
      <head>
        {/* Apply the saved look before first paint so the page never flashes the wrong colors. */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("lateice.theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}` }} />
      </head>
      <body>
        {site ? children : <Providers>{children}</Providers>}
      </body>
    </html>
  );
}
