-- Season rating. A player's starting point for the Late Ice Rating was the league baseline for
-- everyone. Now base_rating keeps that baseline, and the nightly recompute sets start_rating from
-- the rink's season totals (points per game against the league), so skaters with no scanned
-- sheet or recorded lineup still get a number. Scanned games and lineups then move it as before.
alter table players add column if not exists base_rating double precision;
update players set base_rating = start_rating where base_rating is null;
