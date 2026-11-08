-- Release 3: three stars voting (off by default, per league), milestones, share cards.

alter table leagues add column if not exists star_voting boolean not null default false;

create table if not exists star_votes (
  game_id int not null references games(id) on delete cascade,
  voter_user_id int not null references users(id) on delete cascade,
  rank int not null check (rank between 1 and 3),
  player_id int not null references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (game_id, voter_user_id, rank),
  unique (game_id, voter_user_id, player_id)
);
create index if not exists star_votes_game on star_votes(game_id);
alter table star_votes enable row level security;
revoke all on public.star_votes from anon, authenticated;

create table if not exists milestones (
  id serial primary key,
  player_id int not null references players(id) on delete cascade,
  kind text not null,
  game_id int references games(id) on delete set null,
  earned_on text,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (player_id, kind)
);
create index if not exists milestones_player on milestones(player_id);
alter table milestones enable row level security;
revoke all on public.milestones from anon, authenticated;
