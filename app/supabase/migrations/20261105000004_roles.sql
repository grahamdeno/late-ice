-- Roles and permissions (docs/ROLES.md). Replaces team_roles.

create table role_grants (
  id serial primary key,
  user_id int not null references users(id),
  role text not null check (role in ('assistant_captain','captain','scorekeeper','commissioner','rink_manager','support','admin')),
  scope_type text not null check (scope_type in ('team','league','rink','system')),
  scope_id int,
  granted_by int references users(id),
  granted_at timestamptz not null default now(),
  revoked_by int references users(id),
  revoked_at timestamptz,
  note text,
  check ((scope_type = 'system') = (scope_id is null))
);
create index role_grants_user on role_grants(user_id) where revoked_at is null;
create index role_grants_scope on role_grants(scope_type, scope_id) where revoked_at is null;
-- One active captain per team; one active grant of a role per person per scope.
create unique index role_grants_one_captain on role_grants(scope_id) where role = 'captain' and revoked_at is null;
create unique index role_grants_no_dupes on role_grants(user_id, role, scope_type, coalesce(scope_id, 0)) where revoked_at is null;

-- Staff and support actions.
create table audit_log (
  id serial primary key,
  actor_user_id int references users(id),
  action text not null,
  target_type text not null,
  target_id int,
  rink_id int,
  before_json text,
  after_json text,
  note text,
  created_at timestamptz not null default now()
);
create index audit_log_rink on audit_log(rink_id, id desc);

-- Rink manager access requests, captain contests and captain hand-offs.
create table role_requests (
  id serial primary key,
  kind text not null check (kind in ('rink_manager','captain_contest','captain_handoff')),
  user_id int not null references users(id),
  scope_type text not null,
  scope_id int,
  target_user_id int references users(id),
  message text,
  status text not null default 'open' check (status in ('open','approved','declined','cancelled')),
  decided_by int references users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index role_requests_open on role_requests(kind, status);

-- Account merges, run after a 24-hour hold unless an admin starts them.
create table account_merges (
  id serial primary key,
  from_user_id int not null references users(id),
  to_user_id int not null references users(id),
  requested_by int not null references users(id),
  run_after timestamptz not null,
  status text not null default 'pending' check (status in ('pending','done','cancelled')),
  notified_at timestamptz,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

-- Users merged into another account stay as a tombstone so history still points somewhere.
alter table users add column if not exists merged_into int references users(id);

insert into role_grants (user_id, role, scope_type, scope_id, granted_by, granted_at, note)
select user_id, 'captain', 'team', team_id, null, created_at, 'migrated'
from team_roles where role = 'captain';

drop table team_roles;

do $$
declare t text;
begin
  foreach t in array array['role_grants','audit_log','role_requests','account_merges'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
