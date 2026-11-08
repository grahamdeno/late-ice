-- Fix for 20261106000801: it matched poll names to roster spots by display name, but most
-- spots store a first name and last initial ("Steve L."), not initials ("S. L."), so only a few
-- landed. Match again: a full display name as written ("Graham D."), or initials taken from the
-- player's name, and only when exactly one spot on the team has those initials. Adds the missing
-- rows; existing ones stay.
do $$
declare
  tid int;
  gid int;
  polls jsonb := '{
    "2026-09-13": ["Graham D.","D. M.","S. M.","J. B.","N. B.","B. M.","J. H.","A. F.","K. S.","S. G.","C. H.","A. Y.","M. M."],
    "2026-09-20": ["Graham D.","S. G.","K. S.","B. M.","J. A.","D. M.","S. L.","C. H.","S. M.","J. B.","A. Y.","M. M.","A. F."],
    "2026-09-27": ["Graham D.","J. H.","C. H.","B. M.","S. L.","A. Y.","D. M.","S. G.","M. M."],
    "2026-10-04": ["Graham D.","D. M.","K. S.","A. F.","J. H.","J. A.","J. B.","N. B.","A. Y.","S. G.","C. H.","B. M.","S. L."],
    "2026-10-11": ["Graham D.","J. A.","S. M.","C. H.","S. G.","B. M.","M. M.","D. M.","J. H.","S. L.","A. Y."],
    "2026-10-18": ["Graham D.","M. M.","B. M.","J. H.","K. S.","N. B.","S. M.","D. M.","J. A.","J. B.","S. G.","A. F.","A. Y.","S. L.","C. H."],
    "2026-11-01": ["Graham D.","S. L.","J. A.","M. M.","D. M.","S. M.","J. H.","C. H.","S. G.","B. M."],
    "2026-10-25": ["Graham D.","S. L.","A. F.","D. M.","K. S.","S. M.","J. B.","S. G."],
    "2026-08-23": ["Graham D.","D. M.","B. M.","C. H.","A. F.","J. H.","M. M.","N. B.","S. L."],
    "2026-08-30": ["Graham D.","N. B.","S. L.","A. F.","K. S.","S. G.","D. M.","A. Y."]
  }'::jsonb;
  d text;
  n text;
  pid int;
  hits int;
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

    for n in select jsonb_array_elements_text(polls -> d) loop
      select count(*), min(p.id) into hits, pid
      from players p join roster_entries re on re.player_id = p.id and re.team_id = tid
      where p.display_name = n
         or (n !~ '[a-z]'
             and upper(left(split_part(btrim(p.name), ' ', 1), 1)) || '. ' ||
                 upper(left(regexp_replace(btrim(p.name), '^.*\s', ''), 1)) || '.' = n);
      if hits = 1 then
        insert into imported_game_attendance (game_id, player_id, team_id)
        values (gid, pid, tid)
        on conflict (game_id, player_id) do nothing;
      end if;
    end loop;
  end loop;
end $$;
