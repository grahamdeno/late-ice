-- Late Ice schema.
-- Every table has row level security ON with no policies: the browser's anon key can
-- read and write nothing. All data access goes through the Next.js server, which
-- connects as the database owner. Real player names never leave the server except
-- through display_name.

create table regions (
  id serial primary key,
  slug text unique not null,
  name text not null,
  state text not null
);

create table rinks (
  id serial primary key,
  region_id int not null references regions(id),
  slug text unique not null,
  name text not null,
  former_name text,
  address text,
  phone text,
  sheets int default 1,
  surface text,
  website text
);

create table seasons (
  id serial primary key,
  rink_id int not null references rinks(id),
  name text not null,
  starts_on text not null,
  ends_on text not null
);

create table leagues (
  id serial primary key,
  rink_id int not null references rinks(id),
  level text not null,
  name text not null,
  blurb text,
  season text not null,
  sort int default 0
);

create table teams (
  id serial primary key,
  league_id int not null references leagues(id),
  name text not null,
  color text not null,
  is_sample int default 0,
  created_from_sheet int,
  logo text
);

create table users (
  id serial primary key,
  auth_id uuid unique,
  phone text unique not null,
  name text,
  number text,
  position text,
  home_rink_id int references rinks(id),
  status text not null default 'available',
  status_until text,
  hidden int not null default 0,
  created_at timestamptz default now()
);

create table players (
  id serial primary key,
  name text not null,
  name_key text not null,
  position text default 'F',
  rating double precision not null,
  start_rating double precision,
  games_rated int default 0,
  claimed int default 0,
  user_id int references users(id),
  hidden int not null default 0,
  display_name text,
  created_at timestamptz default now()
);
create index players_key on players(name_key);
create index players_user on players(user_id);

create table roster_entries (
  id serial primary key,
  team_id int not null references teams(id),
  player_id int not null references players(id) on delete cascade,
  number text,
  source text default 'sheet',
  added_at timestamptz,
  unique(team_id, player_id)
);

create table team_imports (
  id serial primary key,
  team_id int not null references teams(id),
  season_id int references seasons(id),
  gp int not null, w int not null, l int not null, t int not null, otl int default 0,
  as_of text not null, source text not null
);

create table player_imports (
  id serial primary key,
  player_id int not null references players(id) on delete cascade,
  team_id int not null references teams(id),
  season_id int references seasons(id),
  gp int not null, g int not null, a int not null, pim int not null,
  as_of text not null, source text not null
);

create table sheets (
  id serial primary key,
  image_path text not null,
  mime text not null,
  status text not null,
  source text default 'upload',
  extracted_json text,
  warnings_json text,
  error text,
  model text,
  ms int,
  game_id int,
  scanned_by int references users(id),
  created_at timestamptz default now()
);

create table games (
  id serial primary key,
  league_id int not null references leagues(id),
  season_id int references seasons(id),
  home_team_id int not null references teams(id),
  away_team_id int not null references teams(id),
  played_on text,
  start_time text,
  home_score int not null,
  away_score int not null,
  periods_json text,
  goals_json text,
  penalties_json text,
  shots_json text,
  sheet_id int,
  rated_at timestamptz,
  created_at timestamptz default now()
);

create table player_game_stats (
  id serial primary key,
  game_id int not null references games(id),
  player_id int not null references players(id) on delete cascade,
  team_id int not null references teams(id),
  number text,
  goals int default 0,
  assists int default 0,
  pim int default 0,
  is_goalie int default 0,
  shots_against int,
  goals_against int
);
create index pgs_game on player_game_stats(game_id);
create index pgs_player on player_game_stats(player_id);

create table rating_history (
  id serial primary key,
  player_id int not null references players(id) on delete cascade,
  game_id int not null references games(id),
  before double precision not null,
  after double precision not null,
  reasons_json text not null,
  algo_version text not null default 'lir-1',
  created_at timestamptz default now()
);
create index rh_player on rating_history(player_id);

create table team_roles (
  id serial primary key,
  team_id int not null references teams(id),
  user_id int not null references users(id),
  role text not null,
  created_at timestamptz default now(),
  unique(team_id, user_id, role)
);

create table roster_actions (
  id serial primary key,
  team_id int not null references teams(id),
  actor_user_id int references users(id),
  action text not null,
  player_id int,
  target_user_id int references users(id),
  detail text,
  created_at timestamptz default now()
);

create table notifications (
  id serial primary key,
  user_id int not null references users(id),
  kind text not null,
  title text not null,
  body text,
  link text,
  team_id int,
  player_id int,
  read_at timestamptz,
  created_at timestamptz default now()
);
create index notifications_user on notifications(user_id, id desc);

create table hide_requests (
  id serial primary key,
  player_id int not null references players(id) on delete cascade,
  contact text,
  note text,
  created_at timestamptz default now()
);

-- Rating jobs: a game is rated once when confirmed; the nightly job replays everything.
create table rating_runs (
  id serial primary key,
  kind text not null,
  algo_version text not null,
  games int not null default 0,
  ms int,
  created_at timestamptz default now()
);

-- Lock everything to the server.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Private bucket for scoresheet photos. The server reads and writes it with the service role.
insert into storage.buckets (id, name, public) values ('sheets', 'sheets', false)
on conflict (id) do nothing;
