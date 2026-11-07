-- The sample rink: what signed-out visitors see instead of real rinks, teams and players.
-- Every name here is made up. Real rinks stay in the database and show only after sign-in.

alter table rinks add column if not exists is_sample boolean not null default false;

do $$
declare
  v_region int;
  v_rink int;
  v_season int;
  v_league int;
  v_team int;
  v_player int;
  v_game int;
  lv record;
  t record;
  pair record;
  firsts text[] := array['Jordan','Casey','Riley','Morgan','Avery','Quinn','Drew','Parker','Reese','Rowan','Sawyer','Emerson','Hayden','Logan','Peyton','Jamie','Skyler','Dakota','Finley','Harper','Kendall','Micah','Shay','Tatum'];
  lasts text[] := array['Albright','Brennan','Calloway','Dunmore','Easton','Fairley','Garrity','Hollis','Ingram','Jessup','Kettering','Lindqvist','Marlow','Northcott','Okafor','Pruitt','Quill','Ramsey','Stroud','Thayer','Underhill','Vance','Whitlock','Yardley'];
  positions text[] := array['G','C','C','C','W','W','W','W','D','D','D','D'];
  n int := 0;
  g int;
  i int;
  hs int; as_ int;
  d date;
begin
  if exists (select 1 from rinks where is_sample) then return; end if;

  insert into regions (slug, name, state, country) values ('sample', 'Anytown', 'NC', 'US')
    on conflict (slug) do update set name = excluded.name returning id into v_region;

  insert into rinks (region_id, slug, name, city, state, country, address, sheets, surface, is_sample)
    values (v_region, 'sample-rink', 'Sample Ice Center', 'Anytown', 'NC', 'US', 'A made-up rink to show how Late Ice works', 1, 'NHL-size sheet', true)
    returning id into v_rink;

  insert into seasons (rink_id, name, starts_on, ends_on) values (v_rink, 'Sample season', '2026-01-01', '2099-12-31') returning id into v_season;

  for lv in select * from (values
    ('A', 'A League', 0, 3.9, array['Ridge Runners','Harbor Hawks','Iron Pines','North Shore Owls'], array['#3B82F6','#EF4444','#22C55E','#A855F7']),
    ('B', 'B League', 1, 3.2, array['Timber Wolves','Blue Herons','Copper Kings','Night Shift'], array['#F97316','#06B6D4','#F5B301','#14B8A6']),
    ('C', 'C League', 2, 2.6, array['Lake Effect','Backcheck Brigade','Sunday Skaters','Late Bloomers'], array['#EC4899','#84CC16','#3B82F6','#EF4444'])
  ) as x(level, name, sort, base, teams, colors) loop
    insert into leagues (rink_id, level, name, season, sort, blurb)
      values (v_rink, lv.level, lv.name, 'Sample season', lv.sort, 'Sample league. Every team and player here is made up.')
      returning id into v_league;

    for i in 1..4 loop
      insert into teams (league_id, name, color, is_sample) values (v_league, lv.teams[i], lv.colors[i], 1) returning id into v_team;
      for g in 1..12 loop
        n := n + 1;
        insert into players (name, name_key, position, rating, start_rating, display_name, games_rated)
          values (firsts[1 + (n * 7) % 24] || ' ' || lasts[1 + (n * 11 + (n / 24) * 5) % 24],
                  'sample-' || n,
                  positions[g],
                  round((lv.base + ((n * 37) % 11 - 5) * 0.06)::numeric, 2),
                  lv.base,
                  firsts[1 + (n * 7) % 24] || ' ' || left(lasts[1 + (n * 11 + (n / 24) * 5) % 24], 1) || '.',
                  0)
          returning id into v_player;
        insert into roster_entries (team_id, player_id, number, source, added_at)
          values (v_team, v_player, (g * 7 % 98 + 2)::text, 'sample', now());
      end loop;
    end loop;

    -- Every pairing twice, one a week, ending a few days ago.
    i := 0;
    for pair in
      select a.id home, b.id away, row_number() over (order by a.id, b.id) rn
      from teams a join teams b on b.league_id = a.league_id and b.id <> a.id
      where a.league_id = v_league
    loop
      i := i + 1;
      d := current_date - (3 + (12 - i) * 7) - lv.sort;
      hs := (i * 5 + lv.sort * 3) % 6;
      as_ := (i * 3 + lv.sort * 2 + 1) % 5;
      insert into games (league_id, season_id, home_team_id, away_team_id, played_on, start_time, home_score, away_score, source)
        values (v_league, v_season, pair.home, pair.away, to_char(d, 'YYYY-MM-DD'), '21:15', hs, as_, 'sample')
        returning id into v_game;

      -- Box score: every rostered player dressed; goals and assists spread across the skaters.
      insert into player_game_stats (game_id, player_id, team_id, number, goals, assists, pim, is_goalie, shots_against, goals_against)
      select v_game, x.player_id, x.team_id, x.number,
        case when x.position = 'G' then 0 else (select count(*) from generate_series(1, x.score) k where (k * 5 + v_game) % 11 = x.idx)::int end,
        case when x.position = 'G' then 0 else (select count(*) from generate_series(1, x.score) k where (k * 5 + v_game + 4) % 11 = x.idx)::int end,
        case when (x.player_id + v_game) % 9 = 0 then 2 else 0 end,
        case when x.position = 'G' then 1 else 0 end,
        case when x.position = 'G' then 22 + (v_game % 12) end,
        case when x.position = 'G' then x.against end
      from (
        select re.player_id, re.team_id, re.number, p.position,
          (row_number() over (partition by re.team_id, (p.position = 'G') order by re.player_id) - 1)::int idx,
          case when re.team_id = pair.home then hs else as_ end score,
          case when re.team_id = pair.home then as_ else hs end against
        from roster_entries re join players p on p.id = re.player_id
        where re.team_id in (pair.home, pair.away)
      ) x;
    end loop;
  end loop;
end $$;
