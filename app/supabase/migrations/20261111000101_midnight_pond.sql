-- The made-up rink becomes Midnight Pond: punny, family-safe teams and players, team logos, and a bobblehead per player.
-- Touches only the sample rink and its players (name_key 'sample-N'). Real rinks, teams and players are never changed.

alter table players add column if not exists avatar jsonb;

do $$
declare
  v_rink int;
  names text[] := array['Paddy Stack','Puck Rogers','Ty Breaker','Al Star','Lou Spuck','Cy Saucer','Moe Mentum','Rick O''Shay','Will Score','Ray Ferree','Penn Altee','Owen Goal','Clint Cage','Drew Penalty','Iva Breakaway','Sonny Slapshot','Lyle Linesman','Clay Rebound','Neil Down','Gary Wraparound','Jim Bag','Dusty Bench','Biff Faceoff','Zach Zamboni','Phil Net','Lance Blade','Mo Hawk','Earl E. Lineup','Otto Matic','Vic Tory','Willie Makeit','Jack Pot','Max Overtime','Bill Board','Terry Cloth','Ryan Glass','Shane Pad','Lacey Skates','Benny Box','Cliff Hanger','Ace Snipes','Scott Free','Dan Gle','Elle Bowpad','Shinny McGee','Barry Biscuit','Dee Fenseman','Noah Fence','Les Goals','Kelly Celly','Rusty Blades','Iggy Loo','Cole Shoulder','Stanley Cupp','Hugo First','Justin Time','Wade Forit','Hy Stick','Miles Offside','Ike Ing','Barry Blocker','Woody Stickman','Lefty Wrister','Duke Dangle','Rocky Boards','Tuck Shelfington','Robin Thepuck','Sal Ute','Chip Inn','Buzz Erbeater','Hal Lowice','Frank Lee Offside','Lucky Postman','Jordan Bardown','Reese Backhand','Jamie Biscuitson','Shay Slushman','Avery Hattrick','Hayden Crossbar','Harper Dekeman','Casey Bluelini','Rowan Shinpad','Skyler Cherrypick','Tatum Goalpost','Mitch Glovesave','Quinn Chirpwell','Logan Rinkman','Kendall Facewash','Riley Wristwell','Sawyer Toedrag','Dakota Snipesworth','Blake Iceberg','Parker Tapetoe','Peyton Ridgeback','Micah Pylon','Morgan Celliday','Wally Crease','Emerson Frostbyte','Finley Saucerly','Jordan Crossbar','Reese Dekeman','Jamie Bluelini','Shay Shinpad','Avery Cherrypick','Hayden Goalpost','Harper Chirpwell','Casey Rinkman','Rowan Facewash','Danny Doorstop','Skyler Wristwell','Tatum Toedrag','Quinn Snipesworth','Logan Iceberg','Kendall Tapetoe','Riley Ridgeback','Sawyer Pylon','Dakota Celliday','Blake Frostbyte','Parker Saucerly','Peyton Bardown','Sid Sieve','Micah Backhand','Morgan Biscuitson','Emerson Slushman','Finley Hattrick','Jordan Goalpost','Reese Chirpwell','Jamie Rinkman','Shay Facewash','Avery Wristwell','Hayden Toedrag','Harper Snipesworth','Gus Fivehole','Casey Iceberg','Rowan Tapetoe','Skyler Ridgeback','Tatum Pylon','Quinn Celliday','Logan Frostbyte','Kendall Saucerly','Riley Bardown','Sawyer Backhand','Dakota Biscuitson','Blake Slushman'];
  skins int := 6; hairs int := 7;
  helmets text[] := array['team','#141a24','#EEF3F8','#3B82F6','#EF4444','#22C55E','#F5B301','#A855F7'];
  guards text[] := array['cage','visor','none'];
  beards text[] := array['none','stubble','full'];
  r record;
  n int;
begin
  select id into v_rink from rinks where is_sample order by id limit 1;
  if v_rink is null then return; end if;

  update rinks set name = 'Midnight Pond', address = 'A made-up pond rink where the late games never end'
    where id = v_rink and name = 'Sample Ice Center';
  update seasons set name = 'Pond season' where rink_id = v_rink and name = 'Sample season';
  update leagues set season = 'Pond season', blurb = 'A made-up league at Midnight Pond. Every team and player here is invented.'
    where rink_id = v_rink;

  for r in select * from (values
    ('Ridge Runners',     'Midnight Snackers', '#6366F1', 'midnight-snackers'),
    ('Harbor Hawks',      'Frozen Assets',     '#0EA5E9', 'frozen-assets'),
    ('Iron Pines',        'Top Shelf Tacos',   '#F59E0B', 'top-shelf-tacos'),
    ('North Shore Owls',  'Zamboni Zombies',   '#22C55E', 'zamboni-zombies'),
    ('Timber Wolves',     'Biscuits & Gravy',  '#B45309', 'biscuits-and-gravy'),
    ('Blue Herons',       'Celly Belly',       '#EC4899', 'celly-belly'),
    ('Copper Kings',      'Hat Trick Ponies',  '#A855F7', 'hat-trick-ponies'),
    ('Night Shift',       'Sticks & Scones',   '#14B8A6', 'sticks-and-scones'),
    ('Lake Effect',       'Mighty Mullets',    '#EF4444', 'mighty-mullets'),
    ('Backcheck Brigade', 'Five Hole Donuts',  '#F472B6', 'five-hole-donuts'),
    ('Sunday Skaters',    'Cold Cuts',         '#3B82F6', 'cold-cuts'),
    ('Late Bloomers',     'Backcheck Bandits', '#64748B', 'backcheck-bandits')
  ) as x(old_name, new_name, color, slug) loop
    update teams t set name = r.new_name, color = r.color, logo = '/sample-logos/' || r.slug || '.svg'
      from leagues l where l.id = t.league_id and l.rink_id = v_rink and t.name = r.old_name;
  end loop;

  -- Players: the Nth sample player gets the Nth name. Full names are shown to everyone (see applyViewerNames).
  for r in select p.id, (substring(p.name_key from 8))::int as n, p.position
           from players p where p.name_key ~ '^sample-[0-9]+$' loop
    n := r.n;
    if n < 1 or n > array_length(names, 1) then continue; end if;
    update players set name = names[n], display_name = names[n],
      avatar = jsonb_build_object(
        'skin', (n * 5) % skins,
        'hair', (n * 3) % hairs,
        'helmet', helmets[1 + (n * 7) % 8],
        'guard', case when r.position = 'G' then 'cage' else guards[1 + n % 3] end,
        'beard', beards[1 + (n * 2) % 3],
        -- Every Mighty Mullet has the flow.
        'style', case when (n - 1) / 12 = 8 or n % 4 = 0 then 'flow' else 'none' end,
        'eyeBlack', n % 5 = 0)
      where id = r.id;
  end loop;
end $$;
