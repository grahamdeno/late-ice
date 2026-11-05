-- Beer league rosters run 16 to 20 and more. 15 blocked real teams the day it shipped.
-- Default to 25, the USA Hockey adult roster limit; leagues still at the old default move up. Rink staff can lower it.
alter table leagues alter column roster_max set default 25;
update leagues set roster_max = 25 where roster_max = 15;
