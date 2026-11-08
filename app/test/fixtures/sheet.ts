import type { OcrPlayer, OcrResult, OcrTeam } from "@/server/ocr";

export function player(number: string, name: string, position: string | null = null): OcrPlayer {
  return { number, name, position };
}

/** A team whose own totals, roster and goalie agree. */
export function team(overrides: Partial<OcrTeam> = {}): OcrTeam {
  return {
    name: "Hammer'd Heads",
    roster: [player("1", "Pat Goal", "G"), player("12", "Sam Skater")],
    goals: [{ period: 1, time: "12:00", scorer: "12", assist1: null, assist2: null }],
    penalties: [],
    shots_by_period: [8],
    score_by_period: [1],
    total: 1,
    ...overrides,
  };
}

/** A sheet checkSheet accepts with no warnings. */
export function sheet(overrides: Partial<OcrResult> = {}): OcrResult {
  return {
    is_scoresheet: true,
    date: "2026-11-01",
    time: "11:15 PM",
    league_text: "C",
    rink_text: "Polar Ice",
    home: team({ name: "Hammer'd Heads" }),
    away: team({ name: "Late Arrival" }),
    confidence: 0.95,
    notes: [],
    ...overrides,
  };
}
