-- Who was in goal for an imported (DaySmart) game. One player per team per game.
alter table imported_game_attendance add column if not exists in_goal boolean not null default false;
