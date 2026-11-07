-- Team schedules: synced from a captain's calendar feed (Dash by DaySmart and other iCal links)
-- or added by hand for tournaments, exhibitions and playoffs that aren't on the league calendar.

create table team_feeds (
  team_id int primary key references teams(id) on delete cascade,
  url text not null,                 -- private: the link carries the calendar's key; never sent to the browser
  added_by int references users(id),
  added_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_error text,
  last_count int
);

create table scheduled_games (
  id serial primary key,
  team_id int not null references teams(id) on delete cascade,
  opponent_team_id int references teams(id),
  opponent_name text,
  is_home boolean,
  starts_at timestamptz not null,
  local_date text not null,          -- YYYY-MM-DD at the rink
  local_time text,                   -- "9:15 PM" at the rink
  location text,
  kind text not null default 'league' check (kind in ('league', 'playoff', 'tournament', 'exhibition')),
  source text not null default 'manual' check (source in ('feed', 'manual')),
  external_uid text,
  summary text,
  status text not null default 'scheduled' check (status in ('scheduled', 'canceled')),
  created_by int references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index scheduled_games_feed_uid on scheduled_games(team_id, external_uid) where external_uid is not null;
create index scheduled_games_team_time on scheduled_games(team_id, starts_at);

do $$
declare t text;
begin
  foreach t in array array['team_feeds','scheduled_games'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
