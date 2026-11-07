-- Rink managers get a Monday email about their rink. This turns it off.
alter table notification_prefs add column if not exists weekly_email boolean not null default true;
