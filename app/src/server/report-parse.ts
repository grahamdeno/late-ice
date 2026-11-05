// Parser for the league report format (pure, no database), shared by the importer and tests.
export interface PGame { date: string; time: string | null; home: string; away: string; homeScore: number; awayScore: number; rows: PRow[] }
export interface PRow { team: string; name: string; g: number; a: number }
export interface PTeamRow { team: string; gp: number; w: number; l: number; t: number; otl: number; gf: number | null; ga: number | null }
export interface PTotal { team: string; name: string; gp: number; g: number; a: number; pim: number }
export interface Parsed {
  level: string | null; leagueName: string | null; games: PGame[]; rosters: Record<string, string[]>; teamName: string | null;
  teamRows: PTeamRow[]; totals: PTotal[]; goalies: string[]; // "Team|Name"
}

/** "VADIM S." -> "Vadim S." ; "Graham D" -> "Graham D." */
export function cleanName(raw: string) {
  let s = raw.trim().replace(/\s+/g, " ");
  if (s === s.toUpperCase() && /[A-Z]{2}/.test(s.split(" ")[0])) s = s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  s = s.replace(/ ([A-Za-z])$/, " $1.");
  return s;
}

export function parseReport(text: string): Parsed {
  const lines = text.replace(/\r/g, "").split("\n");
  const header = lines.find((l) => /RAW REPORT/i.test(l)) ?? "";
  // "LEAGUE C League | LEVEL C | SEASON Fall 2026" names the league exactly; older reports only have the header.
  const leagueLine = lines.find((l) => /^LEAGUE\s/i.test(l)) ?? "";
  const leagueName = leagueLine.match(/^LEAGUE\s+(.+?)\s*(?:\||$)/i)?.[1]?.trim() || null;
  const levelField = leagueLine.match(/\|\s*LEVEL\s+([^|]+?)\s*(?:\||$)/i)?.[1]?.trim().toUpperCase() ?? null;
  const fromText = (t: string) => t.match(/\b([ABCD]) League\b/i)?.[1]?.toUpperCase() ?? (/(40\+|over 40)/i.test(t) ? "40+" : null);
  const level = (levelField && /^([ABCD]|40\+)$/.test(levelField) ? levelField : null) ?? fromText(leagueName ?? "") ?? fromText(header);
  const teamRows: PTeamRow[] = [];
  const totals: PTotal[] = [];
  const goalies: string[] = [];
  const field = (s: string, k: string) => { const m = s.match(new RegExp(`(?:^|\\|)\\s*${k}\\s+(-?\\d+)\\s*(?=\\||$)`, "i")); return m ? Number(m[1]) : null; };
  const teamName = header.match(/DaySmart name: '([^']+)'/)?.[1] ?? null;
  const games: PGame[] = [];
  const rosters: Record<string, string[]> = {};
  let cur: PGame | null = null;
  let inRosters = false;
  let rosterTeam: string | null = null;
  for (const raw of lines) {
    const l = raw.trimEnd();
    if (/^ROSTERS\b/.test(l)) { inRosters = true; cur = null; continue; }
    if (/^TEAM STATS\b/.test(l)) { cur = null; continue; }
    const tr = l.match(/^TEAMROW\s+(.+?)\s*\|(.*)$/);
    if (tr) {
      const rest = "|" + tr[2];
      teamRows.push({ team: tr[1].trim(), gp: field(rest, "GP") ?? 0, w: field(rest, "W") ?? 0, l: field(rest, "L") ?? 0, t: field(rest, "T") ?? 0, otl: field(rest, "OTL") ?? 0, gf: field(rest, "GF"), ga: field(rest, "GA") });
      continue;
    }
    const tt = l.match(/^TOTALROW\s+(.+?)\s*\|\s*(.+?)\s*\|(.*)$/);
    if (tt) {
      const rest = "|" + tt[3];
      totals.push({ team: tt[1].trim(), name: cleanName(tt[2]), gp: field(rest, "GP") ?? 0, g: field(rest, "G") ?? 0, a: field(rest, "A") ?? 0, pim: field(rest, "PIM") ?? 0 });
      continue;
    }
    if (inRosters) {
      if (!l.trim()) continue;
      if (/^\S/.test(l)) { rosterTeam = l.trim(); rosters[rosterTeam] = []; }
      else if (rosterTeam) {
        const g = /\s*\((?:G|goalie)\)\s*$/i.test(l);
        const n = cleanName(l.replace(/\s*\((?:G|goalie)\)\s*$/i, ""));
        rosters[rosterTeam].push(n);
        if (g) goalies.push(`${rosterTeam}|${n}`);
      }
      continue;
    }
    const g = l.match(/^GAME (\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2}\s*[AP]M)?\s*\|\s*Home:\s*(.+?)\s+(\d+)\s*\|\s*Away:\s*(.+?)\s+(\d+)\s*\|\s*Final/i);
    if (g) {
      cur = { date: g[1], time: g[2]?.toUpperCase().replace(/\s+/, " ") ?? null, home: g[3].trim(), homeScore: Number(g[4]), away: g[5].trim(), awayScore: Number(g[6]), rows: [] };
      games.push(cur);
      continue;
    }
    const r = l.match(/^PLAYERROW\s+(.+?)\s*\|\s*(.+?)\s+((?:(?:SA|SV|GA|G|A)\d+\s*)+)/);
    if (r && cur) {
      const stat = (k: string) => Number(r[3].match(new RegExp(`(?:^|\\s)${k}(\\d+)`))?.[1] ?? 0);
      cur.rows.push({ team: r[1].trim(), name: cleanName(r[2]), g: stat("G"), a: stat("A") });
    }
  }
  return { level, leagueName, games, rosters, teamName, teamRows, totals, goalies };
}

