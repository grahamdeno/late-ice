import type { MetadataRoute } from "next";
import { headers } from "next/headers";

/**
 * The website (lateice.com) can be found in search. The app and Rink Desk hold real rinks, teams and
 * players once signed in, so they stay out of search entirely.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = ((await headers()).get("host") || "").toLowerCase().split(":")[0];
  const siteHosts = (process.env.SITE_HOSTS || "lateice.com,www.lateice.com").split(",").map((h) => h.trim().toLowerCase());
  if (siteHosts.includes(host)) {
    return { rules: { userAgent: "*", allow: ["/", "/rinks", "/captains", "/claim", "/terms", "/privacy"], disallow: ["/api/", "/site"] } };
  }
  return { rules: { userAgent: "*", disallow: "/" } };
}
