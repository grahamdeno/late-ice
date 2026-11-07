-- The bobblehead each player builds. Jersey color and number come from the team; the face and
-- prop come from the archetype teammates voted. Only the picked parts are stored.
alter table users add column if not exists avatar jsonb;
