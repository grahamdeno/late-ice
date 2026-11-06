-- Web push subscriptions and the five notification switches.
-- Additive only. The browser key still cannot read these tables.

create table if not exists push_subscriptions (
  id serial primary key,
  user_id int not null references users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user on push_subscriptions(user_id);

create table if not exists notification_prefs (
  user_id int primary key references users(id) on delete cascade,
  game_day boolean not null default true,
  result boolean not null default true,
  sub_request boolean not null default true,
  roster boolean not null default true,
  confirm boolean not null default true
);

alter table push_subscriptions enable row level security;
alter table notification_prefs enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
revoke all on public.notification_prefs from anon, authenticated;
revoke all on sequence public.push_subscriptions_id_seq from anon, authenticated;
