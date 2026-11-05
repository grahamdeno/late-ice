import "server-only";
// Creating and editing rinks, leagues, seasons and teams, and the checks behind rink requests.
import { one, q, type Tx } from "./db";
import { HttpError, similarity } from "./services";

const PALETTE = ["#EF4444", "#3B82F6", "#22C55E", "#F5B301", "#EC4899", "#14B8A6", "#A855F7", "#F97316", "#06B6D4", "#84CC16"];
export const LEVELS = ["A", "B", "C", "D", "40+"];
const SORT: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, "40+": 4 };

export const clean = (v: unknown, max = 80) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "rink";

export function websiteHost(url: string | null | undefined) {
  if (!url) return null;
  try { return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
}
const FREE_MAIL = /^(gmail|googlemail|yahoo|ymail|outlook|hotmail|live|msn|icloud|me|mac|aol|proton|protonmail|gmx|mail|zoho|comcast|verizon|att|sbcglobal)\./i;

/** The person signed in with this email (proved by the code), so a match to the rink's website domain is real. */
export function emailOnRinkDomain(email: string | null | undefined, website: string | null | undefined) {
  const host = websiteHost(website);
  const dom = String(email ?? "").toLowerCase().split("@")[1];
  if (!host || !dom || FREE_MAIL.test(dom)) return false;
  return dom === host || dom.endsWith(`.${host}`) || host.endsWith(`.${dom}`);
}

/** Look the rink up on OpenStreetMap so an admin can see it's a real place. Best effort. */
export async function mapLookup(name: string, city: string, state: string) {
  if (process.env.LATEICE_MAP_LOOKUP === "off") return { checked: false, matches: [] as any[] };
  const qstr = [name, city, state].filter(Boolean).join(", ");
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&extratags=1&addressdetails=1&countrycodes=us&q=${encodeURIComponent(qstr)}`, {
      signal: ctl.signal, headers: { "user-agent": "LateIce/1.0 (rink verification; late-ice.tangomike.app)", accept: "application/json" },
    });
    if (!r.ok) return { checked: false, matches: [] };
    const rows = (await r.json()) as any[];
    return {
      checked: true,
      matches: rows.slice(0, 3).map((x) => ({
        name: x.name || x.display_name?.split(",")[0], address: x.display_name, lat: Number(x.lat), lon: Number(x.lon),
        isRink: x.type === "ice_rink" || x.category === "leisure" && /ice|rink|skat/i.test(`${x.type} ${x.name}`) || /ice|rink|skat|arena/i.test(x.name ?? ""),
        phone: x.extratags?.phone ?? x.extratags?.["contact:phone"] ?? null, website: x.extratags?.website ?? x.extratags?.["contact:website"] ?? null,
        osm: `https://www.openstreetmap.org/${x.osm_type}/${x.osm_id}`,
      })),
    };
  } catch { return { checked: false, matches: [] }; } finally { clearTimeout(t); }
}

export async function similarRinks(db: Tx, name: string, city: string) {
  const all = await q<any>(db, "SELECT id, name, city, state FROM rinks");
  return all.map((r) => ({ ...r, s: similarity(name, r.name) + (city && r.city && r.city.toLowerCase() === city.toLowerCase() ? 0.15 : 0) }))
    .filter((r) => r.s >= 0.6).sort((a, b) => b.s - a.s).slice(0, 3).map(({ s, ...r }) => r);
}

/** A season covering today: Fall (Sep-Dec), Winter (Jan-Apr) or Summer (May-Aug). */
export function seasonAround(d = new Date()) {
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  if (m >= 9) return { name: `Fall ${y}`, starts: `${y}-09-01`, ends: `${y}-12-31` };
  if (m >= 5) return { name: `Summer ${y}`, starts: `${y}-05-01`, ends: `${y}-08-31` };
  return { name: `Winter ${y}`, starts: `${y}-01-01`, ends: `${y}-04-30` };
}

export async function createRink(db: Tx, d: any, actor: number | null) {
  const name = clean(d.name, 80), city = clean(d.city, 60), state = clean(d.state, 2).toUpperCase();
  if (!name || !city || !/^[A-Z]{2}$/.test(state)) throw new HttpError(400, "Rink name, city and two-letter state are needed.");
  let region = await one<any>(db, "SELECT id FROM regions WHERE lower(name)=lower($1) AND state=$2", [city, state]);
  if (!region) region = await one<any>(db, "INSERT INTO regions (slug, name, state) VALUES ($1,$2,$3) RETURNING id", [`${slugify(city)}-${state.toLowerCase()}-${Date.now() % 100000}`, city, state]);
  let slug = slugify(`${name} ${city}`);
  if (await one(db, "SELECT 1 FROM rinks WHERE slug=$1", [slug])) slug = `${slug}-${Date.now() % 100000}`;
  const pick = d.map?.matches?.[0];
  const rink = await one<any>(db,
    `INSERT INTO rinks (region_id, slug, name, address, phone, website, city, state, lat, lon, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [region!.id, slug, name, clean(d.address, 120) || pick?.address || null, clean(d.phone, 30) || pick?.phone || null, clean(d.website, 120) || pick?.website || null, city, state, pick?.lat ?? null, pick?.lon ?? null, actor]);
  const s = seasonAround();
  await q(db, "INSERT INTO seasons (rink_id, name, starts_on, ends_on) VALUES ($1,$2,$3,$4)", [rink.id, s.name, s.starts, s.ends]);
  return rink;
}

export async function createLeague(db: Tx, rinkId: number, b: any) {
  const level = LEVELS.includes(String(b.level)) ? String(b.level) : null;
  const name = clean(b.name, 60) || (level ? (level === "40+" ? "Over 40" : `${level} League`) : "");
  if (!name) throw new HttpError(400, "Give the league a name.");
  if (await one(db, "SELECT 1 FROM leagues WHERE rink_id=$1 AND lower(name)=lower($2)", [rinkId, name])) throw new HttpError(409, `${name} is already here.`);
  const season = await one<any>(db, "SELECT name FROM seasons WHERE rink_id=$1 ORDER BY ends_on DESC LIMIT 1", [rinkId]);
  return one<any>(db, "INSERT INTO leagues (rink_id, level, name, blurb, season, sort) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
    [rinkId, level ?? name.slice(0, 12), name, clean(b.blurb, 140) || null, season?.name ?? "", level ? SORT[level] : 5]);
}

export async function createTeam(db: Tx, leagueId: number, b: any) {
  const name = clean(b.name, 50);
  if (!name) throw new HttpError(400, "Give the team a name.");
  const teams = await q<any>(db, "SELECT id, name FROM teams WHERE league_id=$1", [leagueId]);
  const dupe = teams.find((t) => similarity(t.name, name) >= 0.85);
  if (dupe) throw new HttpError(409, `${dupe.name} is already in this league.`);
  const color = /^#[0-9a-fA-F]{6}$/.test(String(b.color)) ? String(b.color) : PALETTE[teams.length % PALETTE.length];
  return one<any>(db, "INSERT INTO teams (league_id, name, color, is_sample) VALUES ($1,$2,$3,0) RETURNING *", [leagueId, name, color]);
}

/** A team can be removed only while nothing hangs off it. */
export async function teamIsEmpty(db: Tx, teamId: number) {
  const r = await one<any>(db, `SELECT
      (SELECT COUNT(*) FROM games WHERE home_team_id=$1 OR away_team_id=$1)::int games,
      (SELECT COUNT(*) FROM roster_entries WHERE team_id=$1)::int players,
      (SELECT COUNT(*) FROM team_imports WHERE team_id=$1)::int imports`, [teamId]);
  return r.games === 0 && r.players === 0 && r.imports === 0;
}

export async function removeTeam(db: Tx, teamId: number) {
  await q(db, "UPDATE role_grants SET revoked_at=now(), note=COALESCE(note,'') || ' (team removed)' WHERE scope_type='team' AND scope_id=$1 AND revoked_at IS NULL", [teamId]);
  await q(db, "DELETE FROM roster_actions WHERE team_id=$1", [teamId]);
  await q(db, "UPDATE scheduled_games SET opponent_name=(SELECT name FROM teams WHERE id=$1), opponent_team_id=NULL WHERE opponent_team_id=$1", [teamId]);
  await q(db, "DELETE FROM teams WHERE id=$1", [teamId]);
}
