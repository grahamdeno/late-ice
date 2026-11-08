-- Results imported from a league system (DaySmart first). They show on game, team and player
-- pages but never count twice: standings and season totals already come from the rink's
-- posted numbers (team_imports, player_imports), and imported games carry no lineup, so
-- they are not rated.
alter table games add column if not exists source text not null default 'sheet';

create table imported_game_lines (
  id serial primary key,
  game_id int not null references games(id) on delete cascade,
  player_id int not null references players(id) on delete cascade,
  team_id int not null references teams(id),
  goals int not null default 0,
  assists int not null default 0,
  unique (game_id, player_id)
);
create index imported_game_lines_player on imported_game_lines(player_id);

-- Goals the source lists in the score but credits to nobody.
alter table games add column if not exists unassigned_json text;

-- Polar Ice's Fall 2026 league started Aug 23 (first DaySmart game), not Sep 1.
update seasons set ends_on = '2026-08-22'
  where name = 'Summer 2026' and rink_id = (select id from rinks where slug = 'polar-ice-wilmington');
update seasons set starts_on = '2026-08-23'
  where name = 'Fall 2026' and rink_id = (select id from rinks where slug = 'polar-ice-wilmington');

alter table imported_game_lines enable row level security;
revoke all on public.imported_game_lines from anon, authenticated;
