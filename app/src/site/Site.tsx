import { headers } from "next/headers";
import Link from "next/link";
import { sql, q } from "@/server/db";
import { SUPPORT_EMAIL } from "@/lib/contact";

/** Site links work on lateice.com ("/rinks") and as a preview on the app's address ("/site/rinks"). */
export async function siteBase() {
  const host = ((await headers()).get("host") || "").toLowerCase().split(":")[0];
  const siteHosts = (process.env.SITE_HOSTS || "lateice.com,www.lateice.com").split(",").map((h) => h.trim().toLowerCase());
  return siteHosts.includes(host) ? "" : "/site";
}

/** Where app links go: the app's own address from the website, a plain path in the preview. */
export async function appBase() {
  if ((await siteBase()) === "/site") return "";
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const host = (process.env.CANONICAL_APP_HOST || (process.env.OLD_APP_HOSTS || "late-ice.tangomike.app").split(",")[0]).trim();
  return `https://${host}`;
}

/** Rinks live on Late Ice, with what's there. Public numbers only. */
export async function liveRinks() {
  return q<{ id: number; name: string; city: string | null; state: string | null; leagues: number; teams: number; players: number }>(sql, `
    SELECT r.id, r.name, r.city, r.state,
      (SELECT COUNT(*) FROM leagues l WHERE l.rink_id=r.id AND l.archived_at IS NULL AND l.level NOT IN ('DEMO','TOURN'))::int leagues,
      (SELECT COUNT(*) FROM teams t JOIN leagues l ON l.id=t.league_id WHERE l.rink_id=r.id AND t.archived_at IS NULL AND l.archived_at IS NULL AND l.level NOT IN ('DEMO','TOURN') AND t.is_sample=0)::int teams,
      (SELECT COUNT(DISTINCT re.player_id) FROM roster_entries re JOIN teams t ON t.id=re.team_id JOIN leagues l ON l.id=t.league_id WHERE l.rink_id=r.id AND t.is_sample=0 AND l.level NOT IN ('DEMO','TOURN'))::int players
    FROM rinks r WHERE r.archived_at IS NULL ORDER BY r.name`);
}

export function Dot({ size = 22 }: { size?: number }) {
  return <span aria-hidden="true" className="inline-block rounded-full border-2 border-[#ff3b3b] shrink-0" style={{ width: size, height: size }} />;
}

export async function SiteShell({ children }: { children: React.ReactNode }) {
  const [base, app] = await Promise.all([siteBase(), appBase()]);
  return (
    <div className="min-h-screen bg-[#05070b] text-[#eef3f8]" data-testid="site">
      <header className="max-w-6xl mx-auto px-6 py-5 flex items-center gap-x-6 gap-y-3 flex-wrap">
        <Link href={base || "/"} className="flex items-center gap-2.5 font-black text-xl"><Dot /> Late Ice</Link>
        <span className="flex-1" />
        <nav className="flex items-center gap-5 text-sm font-bold text-[#c3ccd8] flex-wrap" aria-label="Site">
          <Link href={`${base}/rinks`} className="hover:text-white">For rinks</Link>
          <Link href={`${base}/captains`} className="hover:text-white">For captains</Link>
          <a href={`${app}/`} className="hover:text-white">Open the app</a>
          <Link href={`${base}/claim`} className="text-white bg-[#e0262b] hover:bg-[#ec3035] rounded-xl px-4 py-3">Claim your rink</Link>
        </nav>
      </header>
      <main>{children}</main>
      <footer className="max-w-6xl mx-auto px-6 py-10 mt-10 border-t border-[#1c2533] text-sm text-[#8b97a8] flex flex-wrap gap-x-6 gap-y-2">
        <span>Late Ice · beer league hockey, counted</span>
        <span className="flex-1" />
        <a href={`${app}/terms`} className="hover:text-white">Terms</a>
        <a href={`${app}/privacy`} className="hover:text-white">Privacy</a>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-white">Contact</a>
      </footer>
    </div>
  );
}

export function Display({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h1 className={`font-display font-extrabold uppercase leading-[.95] ${className}`}>{children}</h1>;
}

export function Panel({ children, className = "", hero = false }: { children: React.ReactNode; className?: string; hero?: boolean }) {
  return <div className={`rounded-[22px] p-6 ${hero ? "bg-[#14294a]" : "bg-[#151c28]"} ${className}`}>{children}</div>;
}

export function Phone({ children }: { children: React.ReactNode }) {
  return <div aria-hidden="true" className="w-[230px] h-[460px] rounded-[36px] bg-[#0b0f16] p-3.5 shrink-0 shadow-[0_30px_60px_rgba(0,0,0,.5)]">{children}</div>;
}
