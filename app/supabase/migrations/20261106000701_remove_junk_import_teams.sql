-- A DaySmart report's NOTES section was read as roster headings on 2026-11-05, creating
-- teams such as "NOTES" and "PLAYERROW goals vs score: ...". Remove only teams that
-- (a) have a name no real team would have and (b) nothing else points at.
-- The pre-migration backup runs first.
delete from teams t
where t.is_sample = 0
  and t.created_at::date = date '2026-11-05'
  and (
    t.name ~* '^(PLAYERROW|TEAMROW|ZEROROWS|NOTES?|SOURCE|GAME|ROSTERS)\M'
    or t.name ~* '^(Home/Away conflict|DaySmart game)'
    or t.name ~ '^\d{1,4}[-/]\d{1,2}'
    or t.name ~ ':'
    or array_length(regexp_split_to_array(btrim(t.name), '\s+'), 1) > 5
  )
  and not exists (select 1 from games g where g.home_team_id = t.id or g.away_team_id = t.id)
  and not exists (select 1 from roster_entries r where r.team_id = t.id)
  and not exists (select 1 from team_imports x where x.team_id = t.id)
  and not exists (select 1 from player_imports x where x.team_id = t.id)
  and not exists (select 1 from player_game_stats x where x.team_id = t.id)
  and not exists (select 1 from role_grants x where x.scope_type = 'team' and x.scope_id = t.id)
  and not exists (select 1 from roster_actions x where x.team_id = t.id)
  and not exists (select 1 from imported_game_lines x where x.team_id = t.id)
  and not exists (select 1 from scheduled_games x where x.opponent_team_id = t.id);
