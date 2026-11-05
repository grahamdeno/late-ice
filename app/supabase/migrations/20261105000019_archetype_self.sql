-- An archetype a player sets for themselves. Only the system admin can, for now. The team's vote is kept and still shown.
alter table users add column if not exists archetype_self text;
