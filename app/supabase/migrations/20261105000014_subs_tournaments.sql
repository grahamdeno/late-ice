-- Subs: a player who fills in for another team plays that game without joining its roster.
alter table roster_entries add column if not exists is_sub boolean not null default false;

create table sub_requests (
  id serial primary key,
  scheduled_game_id int not null references scheduled_games(id) on delete cascade,
  team_id int not null references teams(id) on delete cascade,
  user_id int not null references users(id) on delete cascade,
  asked_by int references users(id),
  status text not null default 'asked' check (status in ('asked', 'accepted', 'declined', 'canceled')),
  created_at timestamptz not null default now(),
  answered_at timestamptz
);
create unique index sub_requests_one on sub_requests(scheduled_game_id, user_id);

-- Tournaments: their own events, kept out of league standings and season leaderboards.
create table events (
  id serial primary key,
  name text not null,
  host_rink_id int references rinks(id),
  location text,
  starts_on text not null,
  ends_on text not null,
  created_by int references users(id),
  created_at timestamptz not null default now()
);
create table event_teams (
  event_id int not null references events(id) on delete cascade,
  team_id int not null references teams(id) on delete cascade,
  place int check (place between 1 and 3),
  added_by int references users(id),
  primary key (event_id, team_id)
);
create table event_mvp_votes (
  event_id int not null references events(id) on delete cascade,
  voter_user_id int not null references users(id) on delete cascade,
  player_id int not null references players(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (event_id, voter_user_id)
);
alter table games add column if not exists event_id int references events(id) on delete set null;
alter table scheduled_games add column if not exists event_id int references events(id) on delete set null;

do $$
declare t text;
begin
  foreach t in array array['sub_requests','events','event_teams','event_mvp_votes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
