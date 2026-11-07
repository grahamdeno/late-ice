import { NextResponse, type NextRequest } from "next/server";

/**
 * One app, three front doors.
 * - The website (lateice.com): "/" and the site pages are served from /site, without the app's
 *   shell. SITE_HOSTS lists its hostnames.
 * - The app (app.lateice.com, and the old late-ice.tangomike.app until it redirects).
 * - Rink Desk (desk.lateice.com): the computer view for rink staff, at /desk.
 * CANONICAL_APP_HOST, once set, sends the old app address to the new one with the same path.
 * Preview deployments (*.vercel.app) are never redirected.
 */
const SITE_PATHS = new Set(["/", "/rinks", "/captains", "/claim", "/claim/thanks"]);

function hosts(name: string, fallback: string) {
  return (process.env[name] || fallback).split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
}

export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") || "").toLowerCase().split(":")[0];
  const { pathname, search } = req.nextUrl;
  const siteHosts = hosts("SITE_HOSTS", "lateice.com,www.lateice.com");
  const canonical = (process.env.CANONICAL_APP_HOST || "").trim().toLowerCase();
  const oldHosts = hosts("OLD_APP_HOSTS", "late-ice.tangomike.app");

  if (canonical && oldHosts.includes(host) && !host.endsWith(".vercel.app")) {
    return NextResponse.redirect(`https://${canonical}${pathname}${search}`, 308);
  }

  if (host.startsWith("desk.") && pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/desk";
    return NextResponse.redirect(url, 307);
  }

  const isSite = siteHosts.includes(host) || pathname === "/site" || pathname.startsWith("/site/");
  if (!isSite) {
    // App and Rink Desk pages hold real rinks, teams and players once signed in: keep them out of search.
    const res = NextResponse.next();
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  }

  const headers = new Headers(req.headers);
  headers.set("x-li-site", "1");
  if (siteHosts.includes(host) && SITE_PATHS.has(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = pathname === "/" ? "/site" : `/site${pathname}`;
    return NextResponse.rewrite(url, { request: { headers } });
  }
  // App pages asked for on the website host go to the app.
  if (siteHosts.includes(host) && !pathname.startsWith("/site") && !pathname.startsWith("/terms") && !pathname.startsWith("/privacy")) {
    const app = canonical || oldHosts[0];
    if (app) return NextResponse.redirect(`https://${app}${pathname}${search}`, 307);
  }
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!api/|_next/|sw\\.js|manifest\\.webmanifest|favicon|apple-touch-icon|og\\.png|logos/|icons/|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml|woff2?)$).*)"],
};
