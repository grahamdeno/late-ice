import { handle } from "@/server/http";
import { sql, q, one } from "@/server/db";
import { userFromRequest } from "@/server/accounts";

export const dynamic = "force-dynamic";
// Every rink Late Ice knows, for the rink picker. `q` narrows by name, city or state; `yourCountry` is the
// server's guess from the connection (Vercel sets the header), so the picker opens on the right country.
export const GET = handle(async (req) => {
  const u = new URL(req.url);
  const text = (u.searchParams.get("q") || "").trim().toLowerCase().slice(0, 60);
  const rows = await q<any>(sql,
    `SELECT r.id, r.name, r.address, r.city, r.state, r.country, r.is_sample, (SELECT COUNT(*) FROM leagues l WHERE l.rink_id=r.id AND l.archived_at IS NULL AND l.level NOT IN ('DEMO','TOURN'))::int leagues
     FROM rinks r WHERE r.archived_at IS NULL ${text ? "AND (lower(r.name) LIKE $1 OR lower(r.city) LIKE $1 OR lower(r.state)=$2 OR lower(r.address) LIKE $1)" : ""} ORDER BY r.country, r.state, r.city, r.name LIMIT 300`,
    text ? [`%${text}%`, text] : []);
  const hdr = (req.headers.get("x-vercel-ip-country") || "").toUpperCase();
  const yourCountry = hdr === "CA" || hdr === "US" ? hdr : null;
  const viewer = await userFromRequest(req).catch(() => null);
  // Signed out, only the sample rink is listed.
  if (!viewer) { const sample = rows.filter((r: any) => r.is_sample); return { rinks: sample, yourCountry, total: sample.length }; }
  const total = (await one<any>(sql, "SELECT COUNT(*) c FROM rinks WHERE archived_at IS NULL"))!.c;
  return { rinks: rows, yourCountry, total };
});
