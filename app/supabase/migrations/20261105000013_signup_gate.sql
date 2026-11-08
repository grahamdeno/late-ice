-- Sign-up gate. New accounts wait until a captain's invite link or staff lets them in.
-- Everyone who already has an account is let in.
alter table users add column if not exists access text not null default 'waiting';
alter table users drop constraint if exists users_access_check;
alter table users add constraint users_access_check check (access in ('approved', 'waiting', 'removed'));
update users set access = 'approved';
alter table users add column if not exists invited_team_id int references teams(id) on delete set null;
alter table users add column if not exists access_decided_by int references users(id);

create table team_invites (
  token text primary key,
  team_id int not null references teams(id) on delete cascade,
  created_by int references users(id),
  created_at timestamptz not null default now(),
  uses int not null default 0,
  max_uses int not null default 25,
  revoked_at timestamptz
);
create index team_invites_team on team_invites(team_id) where revoked_at is null;

create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_by int references users(id),
  updated_at timestamptz not null default now()
);

-- Players upload, captains confirm.
alter table sheets add column if not exists proposed_json text;
alter table sheets add column if not exists submitted_by int references users(id);
alter table sheets add column if not exists submitted_at timestamptz;
alter table sheets add column if not exists escalated_at timestamptz;

do $$
declare t text;
begin
  foreach t in array array['team_invites','app_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
