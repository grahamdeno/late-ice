-- Game-night lineup: forward lines, defense pairs and the goalie, set by the captain and shared as a picture.
alter table scheduled_games add column if not exists lineup_json text;
alter table scheduled_games add column if not exists lineup_by int references users(id);
alter table scheduled_games add column if not exists lineup_at timestamptz;
