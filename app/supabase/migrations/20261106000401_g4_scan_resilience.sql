-- G4 scan resilience. Additive only.
-- app_events is the product loop log. The existing events table is tournaments; do not use it.

alter table sheets add column if not exists input_tokens int;
alter table sheets add column if not exists output_tokens int;

create table if not exists app_events (
  id serial primary key,
  user_id int,
  kind text,
  team_id int,
  game_id int,
  created_at timestamptz default now()
);

-- One app_open row per user per UTC day. scan, confirm and rsvp stay one row per action.
create unique index if not exists app_events_app_open_utc_day
  on app_events (user_id, ((created_at at time zone 'utc')::date))
  where kind = 'app_open';

create index if not exists app_events_user_kind_created
  on app_events (user_id, kind, created_at desc);

create index if not exists notifications_kind_created
  on notifications (kind, created_at);

alter table app_events enable row level security;
revoke all on public.app_events from anon, authenticated;
revoke all on sequence public.app_events_id_seq from anon, authenticated;
