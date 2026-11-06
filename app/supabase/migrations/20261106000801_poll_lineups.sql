-- Who was in the lineup for imported (DaySmart) games, taken from the team's game poll.
-- DaySmart lists season totals and final scores but not who dressed, so without this an
-- imported game cannot rate players. A game with rows here is rated for that team; games
-- without any stay unrated. Attendance does not change games played or totals, which
-- already come from the rink's posted numbers.
create table if not exists imported_game_attendance (
  id serial primary key,
  game_id int not null references games(id) on delete cascade,
  player_id int not null references players(id) on delete cascade,
  team_id int not null references teams(id),
  unique (game_id, player_id)
);
create index if not exists imported_game_attendance_player on imported_game_attendance(player_id);
alter table imported_game_attendance enable row level security;
revoke all on public.imported_game_attendance from anon, authenticated;

-- Hammer'd Heads, C League, Fall 2026. Players are matched by roster initials.
-- Every step is a no-op where the team, game or player is missing (for example a fresh database).
do $$
declare
  tid int;
  gid int;
  polls jsonb := '{
    "2026-09-13": ["Graham D.","D. M.","S. M.","J. B.","N. B.","B. M.","J. H.","A. F.","K. S.","S. G.","C. H.","A. Y.","M. M."],
    "2026-09-20": ["S. G.","K. S.","B. M.","J. A.","D. M.","S. L.","C. H.","S. M.","J. B.","A. Y.","M. M.","A. F."],
    "2026-09-27": ["Graham D.","J. H.","C. H.","B. M.","S. L.","A. Y.","D. M.","S. G.","M. M."],
    "2026-10-04": ["Graham D.","D. M.","K. S.","A. F.","J. H.","J. A.","J. B.","N. B.","A. Y.","S. G.","C. H.","B. M.","S. L."],
    "2026-10-11": ["Graham D.","J. A.","S. M.","C. H.","S. G.","B. M.","M. M.","D. M.","J. H.","S. L.","A. Y."],
    "2026-10-18": ["Graham D.","M. M.","B. M.","J. H.","K. S.","N. B.","S. M.","D. M.","J. A.","J. B.","S. G.","A. F.","A. Y.","S. L.","C. H."],
    "2026-11-01": ["Graham D.","S. L.","J. A.","M. M.","D. M.","S. M.","J. H.","C. H.","S. G.","B. M."]
  }'::jsonb;
  d text;
begin
  select t.id into tid
  from teams t join leagues l on l.id = t.league_id
  where t.name = 'Hammer''d Heads' and l.name = 'C League'
  order by t.id limit 1;
  if tid is null then return; end if;

  for d in select jsonb_object_keys(polls) loop
    select g.id into gid
    from games g
    where g.played_on = d and g.source <> 'sheet' and (g.home_team_id = tid or g.away_team_id = tid)
    order by g.id limit 1;
    if gid is null then continue; end if;

    insert into imported_game_attendance (game_id, player_id, team_id)
    select gid, p.id, tid
    from players p join roster_entries re on re.player_id = p.id and re.team_id = tid
    where p.display_name in (select jsonb_array_elements_text(polls -> d))
    on conflict (game_id, player_id) do nothing;
  end loop;
end $$;
