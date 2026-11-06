-- Archive instead of delete for anything with history. An archived rink, league or team is
-- hidden from pickers, lists and standings, but its games, stats and ratings stay, and staff
-- can restore it. Hard delete stays limited to things with nothing attached.
alter table rinks add column if not exists archived_at timestamptz;
alter table leagues add column if not exists archived_at timestamptz;
alter table teams add column if not exists archived_at timestamptz;
