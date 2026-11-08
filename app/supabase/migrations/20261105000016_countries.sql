-- Late Ice works at any rink, in the US or Canada. Country rides on the rink; the region keeps city and state or province.
alter table regions add column if not exists country text not null default 'US';
alter table rinks add column if not exists country text not null default 'US';
update rinks r set city = reg.name, state = reg.state from regions reg where reg.id = r.region_id and r.city is null;
create index if not exists rinks_country_state on rinks (country, state, name);
