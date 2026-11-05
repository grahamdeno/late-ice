-- Season baselines can carry goals for and against, so standings show a real goal difference.
-- Null means the rink's page didn't give them; the app shows a dash instead of a zero.
alter table team_imports add column if not exists gf int, add column if not exists ga int;
