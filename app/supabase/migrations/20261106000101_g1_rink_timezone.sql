-- G1: each rink's clock. IR and Away end on this clock. Existing rinks stay Eastern.
alter table rinks add column if not exists timezone text not null default 'America/New_York';
