-- Every league picks a skill level from one fixed scale (A top, B, C, D newest), so standings and
-- ratings line up across rinks. Age group or format (40+, Women's, Coed) is a separate tag.
alter table leagues add column if not exists tag text;
update leagues set tag = '40+' where level = '40+' and tag is null;
