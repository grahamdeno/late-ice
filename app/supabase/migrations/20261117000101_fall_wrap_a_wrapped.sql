-- Fall Wrap, Epic A: Season Wrapped. Additive only; no existing row changes.
--
-- season_wraps: one row per team per season once its Wrapped has opened.
--   opened_by is null when the wrap opened by itself (last game confirmed, or the season ended).
--   hidden_awards holds the keys of team awards the captain chose not to share (A4).
-- Wrapped numbers are never stored: they are read from games, stats and ratings each time, so a sheet
-- confirmed after the wrap opened updates the recap.
--
-- New app_events kinds: wrapped_open, wrapped_share (this release: rollcall_answer, dues_paid_tap later).
-- app_events.kind is plain text with no check, so the kinds need no schema change. The index below
-- keeps counting them cheap.

create table if not exists season_wraps (
  team_id int not null references teams(id) on delete cascade,
  season_id int not null references seasons(id) on delete cascade,
  opened_at timestamptz not null default now(),
  opened_by int references users(id) on delete set null,
  hidden_awards jsonb not null default '[]'::jsonb,
  primary key (team_id, season_id)
);
create index if not exists season_wraps_season on season_wraps(season_id);

create index if not exists app_events_fall_wrap_kinds
  on app_events (kind, created_at desc)
  where kind in ('wrapped_open', 'wrapped_share', 'rollcall_answer', 'dues_paid_tap');

alter table season_wraps enable row level security;
revoke all on public.season_wraps from anon, authenticated;
