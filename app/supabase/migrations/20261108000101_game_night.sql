-- Game night: tonight's details, cooler rotation, skate sharpening.
alter table scheduled_games add column if not exists sheet text;
alter table scheduled_games add column if not exists jersey text;
alter table scheduled_games add column if not exists locker_room text;
alter table scheduled_games add column if not exists cooler_user_id int references users(id) on delete set null;

create table if not exists user_gear (
  user_id int primary key references users(id) on delete cascade,
  sharpened_on text,
  sharpen_every int not null default 15 check (sharpen_every between 3 and 60),
  updated_at timestamptz not null default now()
);
alter table user_gear enable row level security;
revoke all on public.user_gear from anon, authenticated;
