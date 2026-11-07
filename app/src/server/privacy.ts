import "server-only";
// Account export, account deletion, and scoresheet photo cleanup.
// Game lines live on player rows. Deletion anonymizes those rows and removes the user.
// It does not delete player_game_stats. Some older foreign keys use ON DELETE CASCADE
// (RSVPs, archetype votes, sub requests, MVP votes). Those rows go away with the user.
import { one, q, sql } from "./db";
import { HttpError } from "./services";
import { SHEETS_BUCKET, supabaseAdmin } from "./supabase";
import { publicUser, vacateCaptain } from "./accounts";

const err = (status: number, message: string) => new HttpError(status, message);

/** Delete stored photos for sheets confirmed more than 90 days ago. Extracted data stays. */
export async function deleteOldSheetPhotos() {
  const rows = await q<{ id: number; image_path: string }>(sql, `
    SELECT id, image_path FROM sheets
    WHERE status = 'confirmed'
      AND photo_deleted_at IS NULL
      AND confirmed_at IS NOT NULL
      AND confirmed_at < now() - interval '90 days'
      AND image_path IS NOT NULL
      AND btrim(image_path) <> ''
    ORDER BY id`);
  let deleted = 0;
  let failed = 0;
  for (const s of rows) {
    if (!(await removeSheetPhoto(s.image_path))) { failed++; continue; }
    await q(sql, "UPDATE sheets SET photo_deleted_at = now() WHERE id = $1 AND photo_deleted_at IS NULL", [s.id]);
    deleted++;
  }
  return { deleted, failed };
}

async function removeSheetPhoto(path: string) {
  try {
    const { error } = await supabaseAdmin().storage.from(SHEETS_BUCKET).remove([path]);
    if (!error) return true;
    const msg = String(error.message || "").toLowerCase();
    const status = String((error as { status?: number; statusCode?: number | string }).status ?? (error as { statusCode?: number | string }).statusCode ?? "");
    if (status === "404" || msg.includes("not found") || msg.includes("does not exist")) return true;
    console.error("sheet photo delete failed");
    return false;
  } catch {
    console.error("sheet photo delete failed");
    return false;
  }
}

/** The signed-in user's own profile, spots, lines, ratings and notifications. No auth secrets. */
export async function exportAccount(user: any) {
  const id = user.id as number;
  const profile = await publicUser(sql, user);
  const spots = await q(sql, `
    SELECT p.id AS player_id, p.display_name AS name, p.position, p.rating, p.games_rated,
           re.number, re.team_id, t.name AS team_name, l.level
    FROM players p
    JOIN roster_entries re ON re.player_id = p.id
    JOIN teams t ON t.id = re.team_id
    JOIN leagues l ON l.id = t.league_id
    WHERE p.user_id = $1
    ORDER BY t.name, re.number`, [id]);
  const scanned = await q(sql, `
    SELECT s.game_id, s.team_id, s.number, s.goals, s.assists, s.pim, s.is_goalie, g.played_on, 'sheet' AS source
    FROM player_game_stats s
    JOIN games g ON g.id = s.game_id
    WHERE s.player_id IN (SELECT id FROM players WHERE user_id = $1)
    ORDER BY g.played_on, s.id`, [id]);
  const imported = await q(sql, `
    SELECT il.game_id, il.team_id, il.goals, il.assists, g.played_on, 'import' AS source
    FROM imported_game_lines il
    JOIN games g ON g.id = il.game_id
    WHERE il.player_id IN (SELECT id FROM players WHERE user_id = $1)
    ORDER BY g.played_on, il.id`, [id]);
  const ratings = await q(sql, `
    SELECT player_id, game_id, before, after, reasons_json, algo_version, created_at
    FROM rating_history
    WHERE player_id IN (SELECT id FROM players WHERE user_id = $1)
    ORDER BY id`, [id]);
  const notifications = await q(sql, `
    SELECT id, kind, title, body, link, team_id, player_id, read_at, created_at
    FROM notifications WHERE user_id = $1 ORDER BY id`, [id]);
  return {
    profile,
    spots,
    gameLines: [...scanned, ...imported],
    ratings,
    notifications,
  };
}

const CLEAR_USER: string[] = [
  "UPDATE sheets SET scanned_by = NULL WHERE scanned_by = $1",
  "UPDATE sheets SET submitted_by = NULL WHERE submitted_by = $1",
  "UPDATE roster_actions SET actor_user_id = NULL WHERE actor_user_id = $1",
  "UPDATE roster_actions SET target_user_id = NULL WHERE target_user_id = $1",
  "UPDATE role_grants SET granted_by = NULL WHERE granted_by = $1",
  "UPDATE role_grants SET revoked_by = NULL WHERE revoked_by = $1",
  "UPDATE audit_log SET actor_user_id = NULL WHERE actor_user_id = $1",
  "UPDATE role_requests SET target_user_id = NULL WHERE target_user_id = $1",
  "UPDATE role_requests SET decided_by = NULL WHERE decided_by = $1",
  "UPDATE role_requests SET phone_confirmed_by = NULL WHERE phone_confirmed_by = $1",
  "UPDATE team_feeds SET added_by = NULL WHERE added_by = $1",
  "UPDATE scheduled_games SET created_by = NULL WHERE created_by = $1",
  "UPDATE scheduled_games SET lineup_by = NULL WHERE lineup_by = $1",
  "UPDATE rinks SET created_by = NULL WHERE created_by = $1",
  "UPDATE users SET access_decided_by = NULL WHERE access_decided_by = $1 AND id <> $1",
  "UPDATE team_invites SET created_by = NULL WHERE created_by = $1",
  "UPDATE app_settings SET updated_by = NULL WHERE updated_by = $1",
  "UPDATE sub_requests SET asked_by = NULL WHERE asked_by = $1",
  "UPDATE events SET created_by = NULL WHERE created_by = $1",
  "UPDATE event_teams SET added_by = NULL WHERE added_by = $1",
];

/** Anonymize player rows, drop the user row, keep game lines. Auth removal is separate. */
export async function deleteAccountRow(user: any) {
  return sql.begin(async (tx) => {
    if (await one(tx, "SELECT 1 FROM account_merges WHERE from_user_id = $1 OR to_user_id = $1 OR requested_by = $1", [user.id])) {
      throw err(409, "This account is part of a merge, so it was not deleted.");
    }
    if (await one(tx, "SELECT 1 FROM users WHERE merged_into = $1", [user.id])) {
      throw err(409, "Another account points at this one, so it was not deleted.");
    }
    const players = await q<{ id: number; roster_number: string | null }>(tx, `
      SELECT p.id,
        (SELECT re.number FROM roster_entries re
          WHERE re.player_id = p.id AND re.number IS NOT NULL AND re.number <> ''
          ORDER BY re.id LIMIT 1) AS roster_number
      FROM players p WHERE p.user_id = $1 ORDER BY p.id`, [user.id]);
    const anonymized: { id: number; name: string }[] = [];
    for (const p of players) {
      const n = p.roster_number || user.number || null;
      const label = n ? `Player #${n}` : "Player";
      await q(tx, "UPDATE players SET name = $1, name_key = $2, display_name = $1, user_id = NULL, claimed = 0, hidden = 0 WHERE id = $3", [label, `player${p.id}`, p.id]);
      anonymized.push({ id: p.id, name: label });
    }
    const caps = await q<{ scope_id: number }>(tx, "SELECT scope_id FROM role_grants WHERE user_id = $1 AND role = 'captain' AND scope_type = 'team' AND revoked_at IS NULL", [user.id]);
    for (const c of caps) await vacateCaptain(tx, c.scope_id, user.id, "account deleted");
    for (const statement of CLEAR_USER) await q(tx, statement, [user.id]);
    await q(tx, "DELETE FROM notifications WHERE user_id = $1", [user.id]);
    await q(tx, "DELETE FROM role_requests WHERE user_id = $1", [user.id]);
    await q(tx, "DELETE FROM role_grants WHERE user_id = $1", [user.id]);
    const kept = anonymized.length
      ? (await one<{ n: number }>(tx, "SELECT COUNT(*)::int n FROM player_game_stats WHERE player_id IN (SELECT jsonb_array_elements_text($1::text::jsonb)::int)", [JSON.stringify(anonymized.map((p) => p.id))]))!.n
      : 0;
    if (user.auth_id) await q(tx, "INSERT INTO deleted_accounts (auth_id) VALUES ($1) ON CONFLICT (auth_id) DO NOTHING", [user.auth_id]);
    await q(tx, "DELETE FROM app_events WHERE user_id = $1", [user.id]);
    await q(tx, "DELETE FROM users WHERE id = $1", [user.id]);
    return { anonymized, gameLinesKept: kept };
  });
}
