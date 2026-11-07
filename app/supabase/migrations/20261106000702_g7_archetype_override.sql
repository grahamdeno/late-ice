-- G7: a captain can set a different archetype for a player on their own team.
-- A player can opt out of being shown an archetype at all.
alter table roster_entries add column if not exists archetype_override text;
alter table users add column if not exists archetype_opt_out boolean not null default false;
