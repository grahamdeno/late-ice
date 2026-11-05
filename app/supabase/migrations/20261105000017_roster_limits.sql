-- Roster sizes per league. Subs never count; players on injured reserve or away stop counting while they're out.
alter table leagues add column if not exists roster_max int not null default 15;
alter table leagues add column if not exists goalie_max int not null default 2;
