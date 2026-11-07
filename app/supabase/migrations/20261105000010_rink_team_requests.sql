-- New rinks and new teams by request. A new rink goes to the system admins, who check that it
-- exists (public map lookup) and, for a manager, that the person works there (an email on the
-- rink's own domain, or a call to the rink's public number). New teams go to rink staff.
alter table role_requests drop constraint if exists role_requests_kind_check;
alter table role_requests add constraint role_requests_kind_check
  check (kind in ('rink_manager', 'captain_contest', 'captain_handoff', 'new_rink', 'new_team'));
alter table role_requests add column if not exists details jsonb;
alter table role_requests add column if not exists phone_confirmed_by int references users(id);
alter table role_requests add column if not exists phone_confirmed_at timestamptz;

alter table rinks add column if not exists city text;
alter table rinks add column if not exists state text;
alter table rinks add column if not exists lat double precision;
alter table rinks add column if not exists lon double precision;
alter table rinks add column if not exists created_by int references users(id);
alter table rinks add column if not exists created_at timestamptz default now();
update rinks set city = 'Wilmington', state = 'NC' where slug = 'polar-ice-wilmington' and city is null;

alter table leagues add column if not exists created_at timestamptz default now();
alter table teams add column if not exists created_at timestamptz default now();
