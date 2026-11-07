-- G6 trust, privacy and fairness. Additive only.

alter table users add column if not exists age_confirmed_at timestamptz;

alter table sheets add column if not exists confirmed_at timestamptz;
alter table sheets add column if not exists photo_deleted_at timestamptz;

-- Sheets confirmed before this column existed have no confirm time. The game row
-- is written at confirm, so that timestamp is the closest record. Upload time is
-- the fallback when a confirmed sheet has no game.
update sheets s
set confirmed_at = coalesce(g.created_at, s.created_at)
from games g
where s.confirmed_at is null
  and s.status = 'confirmed'
  and s.game_id = g.id;

update sheets
set confirmed_at = created_at
where confirmed_at is null
  and status = 'confirmed';

create index if not exists sheets_photo_cleanup
  on sheets (confirmed_at)
  where status = 'confirmed' and photo_deleted_at is null;

-- Auth ids that must not be turned back into a Late Ice user if a token still verifies.
create table if not exists deleted_accounts (
  auth_id uuid primary key,
  deleted_at timestamptz not null default now()
);

alter table deleted_accounts enable row level security;
revoke all on public.deleted_accounts from anon, authenticated;

-- Record the confirm time without editing the confirm path. Invoker, not definer.
create or replace function public.sheets_mark_confirmed()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'confirmed' and new.confirmed_at is null then
    new.confirmed_at = now();
  end if;
  return new;
end;
$$;

revoke all on function public.sheets_mark_confirmed() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'sheets_mark_confirmed') then
    create trigger sheets_mark_confirmed
      before insert or update on public.sheets
      for each row execute function public.sheets_mark_confirmed();
  end if;
end $$;
