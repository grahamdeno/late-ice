-- Late Ice is live: the made-up A, B, D and Over 40 leagues and their placeholder teams go.
-- Real leagues come in through Staff > Import. The Demo league stays as the sandbox for the
-- sample scoresheets, hidden from standings and the league switcher.
do $$
declare r record;
begin
  for r in select t.id from teams t join leagues l on l.id = t.league_id where t.is_sample = 1 and l.level in ('A', 'B', 'D', '40+') loop
    begin
      delete from roster_actions where team_id = r.id;
      delete from scheduled_games where opponent_team_id = r.id;
      delete from teams where id = r.id;
    exception when foreign_key_violation then
      raise notice 'kept team % because it has data', r.id;
    end;
  end loop;
  for r in select l.id from leagues l where l.level in ('A', 'B', 'D', '40+') loop
    begin
      if not exists (select 1 from teams where league_id = r.id) then delete from leagues where id = r.id; end if;
    exception when foreign_key_violation then
      raise notice 'kept league % because it has data', r.id;
    end;
  end loop;
end $$;
