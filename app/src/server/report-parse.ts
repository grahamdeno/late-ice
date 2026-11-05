// Parser for the league report format (pure, no database), shared by the importer and tests.
export interface PGame { date: string; time: string | null; home: string; away: string; homeScore: number; awayScore: number; rows: PRow[] }
export interface PRow { team: string; name: string; g: number; a: number }
export interface Parsed { level: string | null; games: PGame[]; rosters: Record<string, string[]>; teamName: string | null }

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
  const level = header.match(/\b([ABCD]) League\b/i)?.[1]?.toUpperCase() ?? (/(40\+|over 40)/i.test(header) ? "40+" : null);
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
    if (inRosters) {
      if (!l.trim()) continue;
      if (/^\S/.test(l)) { rosterTeam = l.trim(); rosters[rosterTeam] = []; }
      else if (rosterTeam) rosters[rosterTeam].push(cleanName(l));
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
  return { level, games, rosters, teamName };
}

