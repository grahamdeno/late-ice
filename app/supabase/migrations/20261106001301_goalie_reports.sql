-- Goalie numbers. After a game the goalie enters shots against; goals against comes from the score.
-- The other team's captain confirms (verified), gives a different number (disputed, staff settle),
-- or says not sure (unverified). No answer in 48 hours counts as unverified. Verified numbers count
-- in full toward the goalie's rating; unverified ones count half; disputed ones wait for staff.
create table if not exists goalie_reports (
  id serial primary key,
  game_id int not null references games(id) on delete cascade,
  player_id int not null references players(id) on delete cascade,
  team_id int not null references teams(id),
  shots_against int not null check (shots_against between 0 and 150),
  goals_against int not null check (goals_against >= 0),
  status text not null default 'pending' check (status in ('pending', 'verified', 'disputed', 'unverified')),
  counter_shots int check (counter_shots between 0 and 150),
  submitted_by int references users(id),
  decided_by int references users(id),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (game_id, player_id)
);
create index if not exists goalie_reports_player on goalie_reports(player_id);
alter table goalie_reports enable row level security;
revoke all on public.goalie_reports from anon, authenticated;
