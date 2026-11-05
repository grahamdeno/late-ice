-- Availability, split in two:
--  * per game: In / Out / Late (rsvps)
--  * on the profile: Active, Injured reserve or Away (with a return date), plus two switches.
update users set status = 'active' where status in ('available', 'resting');
alter table users alter column status set default 'active';
alter table users add column if not exists looking_for_team boolean not null default false;
alter table users add column if not exists will_sub boolean not null default false;

create table rsvps (
  scheduled_game_id int not null references scheduled_games(id) on delete cascade,
  user_id int not null references users(id) on delete cascade,
  answer text not null check (answer in ('in', 'out', 'late')),
  updated_at timestamptz not null default now(),
  primary key (scheduled_game_id, user_id)
);
alter table public.rsvps enable row level security;
revoke all on public.rsvps from anon, authenticated;
