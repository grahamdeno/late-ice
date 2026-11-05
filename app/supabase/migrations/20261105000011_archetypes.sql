-- Player archetypes (Goon, Pest, Sniper...), voted by teammates each season.
create table archetype_votes (
  team_id int not null references teams(id) on delete cascade,
  season_id int references seasons(id),
  voter_user_id int not null references users(id) on delete cascade,
  player_id int not null references players(id) on delete cascade,
  archetype text not null check (archetype in ('goon','pest','grinder','sniper','playmaker','beauty','duster','cherry_picker','bender','energy')),
  updated_at timestamptz not null default now()
);
create unique index archetype_votes_one on archetype_votes(team_id, coalesce(season_id, 0), voter_user_id, player_id);
alter table public.archetype_votes enable row level security;
revoke all on public.archetype_votes from anon, authenticated;
