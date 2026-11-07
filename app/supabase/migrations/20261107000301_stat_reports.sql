-- "Report a mistake" on a game: a player says a score, goal, assist or lineup is wrong, and
-- rink staff fix it and close the report.
create table if not exists stat_reports (
  id serial primary key,
  game_id int not null references games(id) on delete cascade,
  user_id int not null references users(id) on delete cascade,
  kind text not null,
  body text not null,
  status text not null default 'open',
  note text,
  resolved_by int references users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists stat_reports_open on stat_reports(game_id) where status = 'open';
alter table stat_reports enable row level security;
revoke all on public.stat_reports from anon, authenticated;
