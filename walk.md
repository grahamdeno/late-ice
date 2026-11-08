# Late Ice UX walkthrough

Seeded C league season at Polar Ice; tonight's games at 9:15 PM ET. Phone 390x844, America/New_York. Engines: webkit, chromium (Chromium player runs throttled to 4G with 4x CPU). 140 screens.

Estimated human time = taps x 1.5s + typed characters x 0.35s + screens x 2s + email code trips x 20s.

**Findings:** 1 blocker, 8 serious, 62 moderate, 0 minor

## Jobs

| Engine | Who | Job | Done | Taps (pass) | Typed | Screens | Est. human s (pass) | Machine s | Pass |
|---|---|---|---|---|---|---|---|---|---|
| webkit | captain | Captain claims his team and shares the invite link | yes | 10 (12) | 45 | 11 | 73 (-) | 19.0 | yes |
| webkit | player | New player: invite link to his team in two minutes | yes | 6 (9) | 43 | 6 | 56 (120) | 9.5 | yes |
| webkit | player | Game night: say In | yes | 1 (1) | 0 | 2 | 6 (8) | 3.3 | yes |
| webkit | captain | Game night: captain checks who's in and posts the room | yes | 2 (5) | 7 | 4 | 13 (-) | 7.4 | yes |
| webkit | player | Game night: player sees sheet and room | yes | 0 (0) | 0 | 1 | 2 (4) | 1.9 | yes |
| webkit | player | After the game: scan the sheet and send it | yes | 3 (4) | 0 | 4 | 13 (30) | 5.6 | yes |
| webkit | captain | Captain confirms the sheet | yes | 2 (3) | 0 | 3 | 9 (20) | 5.0 | yes |
| webkit | player | Player sees his line and why his rating moved | yes | 3 (3) | 0 | 4 | 13 (16) | 6.5 | yes |
| webkit | player | A scan fails: recover by hand | yes | 4 (4) | 76 | 5 | 43 (45) | 6.7 | yes |
| webkit | player | Where do we stand? | yes | 2 (2) | 0 | 2 | 7 (10) | 4.3 | yes |
| webkit | player | Look up tonight's opponent's top player | yes | 3 (3) | 6 | 3 | 13 (16) | 4.7 | yes |
| webkit | player | Change appearance, availability and notifications | yes | 4 (5) | 10 | 6 | 22 (30) | 11.1 | yes |
| webkit | player | Sign out, then back in | yes | 5 (7) | 31 | 5 | 48 (47) | 8.1 | **no** |
| webkit | player | Read it with text at 200 percent | yes | 0 (-) | 0 | 6 | 12 (-) | 14.2 | yes |
| webkit | teammate | Teammate opens the shared game link, not signed in | yes | 0 (1) | 0 | 1 | 2 (10) | 2.0 | yes |
| webkit | leaver | Leaver signs up (setup for the delete job) | yes | 4 (-) | 45 | 3 | 48 (-) | 5.5 | yes |
| webkit | leaver | Delete my account | yes | 3 (4) | 0 | 4 | 13 (17) | 6.7 | yes |
| chromium | captain | Captain claims his team and shares the invite link | yes | 10 (12) | 49 | 11 | 74 (-) | 18.3 | yes |
| chromium 4G | player | New player: invite link to his team in two minutes | yes | 6 (9) | 45 | 6 | 57 (120) | 15.2 | yes |
| chromium 4G | player | Game night: say In | yes | 1 (1) | 0 | 2 | 6 (8) | 4.4 | yes |
| chromium | captain | Game night: captain checks who's in and posts the room | yes | 2 (5) | 7 | 4 | 13 (-) | 7.5 | yes |
| chromium 4G | player | Game night: player sees sheet and room | yes | 0 (0) | 0 | 1 | 2 (4) | 2.6 | yes |
| chromium 4G | player | After the game: scan the sheet and send it | yes | 3 (4) | 0 | 4 | 13 (30) | 8.0 | yes |
| chromium | captain | Captain confirms the sheet | yes | 2 (3) | 0 | 3 | 9 (20) | 5.2 | yes |
| chromium 4G | player | Player sees his line and why his rating moved | yes | 3 (3) | 0 | 4 | 13 (16) | 9.2 | yes |
| chromium 4G | player | A scan fails: recover by hand | yes | 4 (4) | 73 | 5 | 42 (45) | 8.8 | yes |
| chromium 4G | player | Where do we stand? | yes | 2 (2) | 0 | 2 | 7 (10) | 6.3 | yes |
| chromium 4G | player | Look up tonight's opponent's top player | yes | 3 (3) | 5 | 3 | 12 (16) | 6.6 | yes |
| chromium 4G | player | Change appearance, availability and notifications | yes | 4 (5) | 10 | 6 | 22 (30) | 14.3 | yes |
| chromium 4G | player | Sign out, then back in | yes | 5 (7) | 33 | 5 | 49 (47) | 10.8 | **no** |
| chromium 4G | player | Read it with text at 200 percent | yes | 0 (-) | 0 | 6 | 12 (-) | 20.4 | yes |
| chromium | teammate | Teammate opens the shared game link, not signed in | yes | 0 (1) | 0 | 1 | 2 (10) | 2.0 | yes |
| chromium | leaver | Leaver signs up (setup for the delete job) | yes | 4 (-) | 47 | 3 | 48 (-) | 5.6 | yes |
| chromium | leaver | Delete my account | yes | 3 (4) | 0 | 4 | 13 (17) | 6.4 | yes |

## Notes per job

- **webkit / captain-setup:** home rink preset to Polar Ice: yes; invite /join?invite=i28xOks5rPbcnNP7
- **webkit / first-two-minutes:** home rink preset to Polar Ice: yes; Is this you? offered
- **webkit / game-night-in:** Home title: Tonight; counts: 1 in
- **webkit / scan-sheet:** review shows 3-2
- **webkit / captain-confirm:** Home waiting card: yes; unread dot on Me: yes
- **webkit / see-rating-move:** last result card: Last game · Sun, Nov 8 W 3-2 vs Wild Puckers Rating 4.14 +0.022
- **webkit / leaver-signup:** home rink preset to Polar Ice: yes
- **chromium / captain-setup:** home rink preset to Polar Ice: yes; invite /join?invite=RmdN-iCYHwmRRMsb
- **chromium / first-two-minutes:** home rink preset to Polar Ice: yes; Is this you? offered
- **chromium / game-night-in:** Home title: Tonight; counts: 1 in
- **chromium / scan-sheet:** review shows 3-2
- **chromium / captain-confirm:** Home waiting card: yes; unread dot on Me: yes
- **chromium / see-rating-move:** last result card: Last game · Sun, Nov 8 W 3-2 vs Fighting Irish Rating 3.85 +0.040
- **chromium / leaver-signup:** home rink preset to Polar Ice: yes

## Blocker (1)

- **page crash** [webkit, Where do we stand? / ] TypeError: Load failed (040-webkit-scan-failed-by-hand-saved.jpg)

## Serious (8)

- **a11y color-contrast** [webkit, Change appearance, availability and notifications / home-light] /: Elements must meet minimum color contrast ratio thresholds (1x) e.g. .rsvp-in (051-webkit-settings-home-light.jpg)
- **a11y color-contrast** [chromium, Game night: say In / said-in] /: Elements must meet minimum color contrast ratio thresholds (1x) e.g. .rsvp-in (089-chromium-game-night-in-said-in.jpg)
- **request refused** [webkit, Read it with text at 200 percent / zoom-settings] 401 GET /api/sheets/1/image (061-webkit-text-200-zoom-settings.jpg)
- **request refused** [chromium, Read it with text at 200 percent / zoom-leagues] 401 GET /api/teams/10 (129-chromium-text-200-zoom-leagues.jpg)
- **request refused** [chromium, Read it with text at 200 percent / zoom-settings] 401 GET /api/games/78 (131-chromium-text-200-zoom-settings.jpg)
- **request refused** [chromium, Read it with text at 200 percent / zoom-settings] 401 GET /api/sheets/3/image (131-chromium-text-200-zoom-settings.jpg)
- **tap target under 24 pt** [webkit, Player sees his line and why his rating moved / why-open] /player/244: a "Game ›" 42x20 (035-webkit-see-rating-move-why-open.jpg)
- **tap target under 24 pt** [chromium, Player sees his line and why his rating moved / why-open] /player/180: a "Game ›" 44x20 (105-chromium-see-rating-move-why-open.jpg)

## Moderate (62)

- **can't see who's in** [webkit, Game night: captain checks who's in and posts the room / home] Game night: captain checks who's in and posts the room: No way from Home to see who said In (020-webkit-game-night-captain-home.jpg)
- **can't see who's in** [chromium, Game night: captain checks who's in and posts the room / home] Game night: captain checks who's in and posts the room: No way from Home to see who said In (090-chromium-game-night-captain-home.jpg)
- **tap target under 44 pt** [webkit, Captain claims his team and shares the invite link / home-signed-out] /: a[nav-scan] "Scan scoresheet" 71x36 (001-webkit-captain-setup-home-signed-out.jpg)
- **tap target under 44 pt** [webkit, Captain claims his team and shares the invite link / me-claimed] /me: a "WDCWhiskey Dekes#51 · No captain yet›" 326x42 (007-webkit-captain-setup-me-claimed.jpg)
- **tap target under 44 pt** [webkit, Captain claims his team and shares the invite link / me-captain] /me: a "WDCWhiskey Dekes#51 · Captain›" 326x42 (008-webkit-captain-setup-me-captain.jpg)
- **tap target under 44 pt** [webkit, Captain claims his team and shares the invite link / manage] /team/15/manage: a[link-back-team] "‹ Back" 35x44 (009-webkit-captain-setup-manage.jpg)
- **tap target under 44 pt** [webkit, New player: invite link to his team in two minutes / me-claimed] /me: a "WDCWhiskey Dekes#55 · Captain: Luke Baro" 326x42 (016-webkit-first-two-minutes-me-claimed.jpg)
- **tap target under 44 pt** [webkit, New player: invite link to his team in two minutes / home-first] /: a[link-home-lineup] "Lineup" 44x44 (017-webkit-first-two-minutes-home-first.jpg)
- **tap target under 44 pt** [webkit, After the game: scan the sheet and send it / scan-reading] /sheet/1: button[chip-league-C] "C" 40x44 (026-webkit-scan-sheet-scan-reading.jpg)
- **tap target under 44 pt** [webkit, After the game: scan the sheet and send it / scan-reading] /sheet/1: input[input-goal-scorer-home-0] "Goal 1 scorer number, Home (Whiskey Deke" 40x44 (026-webkit-scan-sheet-scan-reading.jpg)
- **tap target under 44 pt** [webkit, After the game: scan the sheet and send it / scan-reading] /sheet/1: input[input-goal-a1-home-0] "Goal 1 first assist number, Home (Whiske" 40x44 (026-webkit-scan-sheet-scan-reading.jpg)
- **tap target under 44 pt** [webkit, After the game: scan the sheet and send it / scan-reading] /sheet/1: input[input-goal-a2-home-0] "Goal 1 second assist number, Home (Whisk" 40x44 (026-webkit-scan-sheet-scan-reading.jpg)
- **tap target under 44 pt** [webkit, After the game: scan the sheet and send it / scan-reading] /sheet/1: input[input-goal-scorer-away-0] "Goal 1 scorer number, Visitor (Wild Puck" 40x44 (026-webkit-scan-sheet-scan-reading.jpg)
- **tap target under 44 pt** [webkit, After the game: scan the sheet and send it / scan-reading] /sheet/1: input[input-goal-a1-away-0] "Goal 1 first assist number, Visitor (Wil" 40x44 (026-webkit-scan-sheet-scan-reading.jpg)
- **tap target under 44 pt** [webkit, After the game: scan the sheet and send it / scan-reading] /sheet/1: input[input-goal-a2-away-0] "Goal 1 second assist number, Visitor (Wi" 40x44 (026-webkit-scan-sheet-scan-reading.jpg)
- **tap target under 44 pt** [webkit, Read it with text at 200 percent / zoom-leagues] /leagues: a[link-standings-team-15] "1WDWhiskey Dekes" 25x44 (059-webkit-text-200-zoom-leagues.jpg)
- **tap target under 44 pt** [webkit, Read it with text at 200 percent / zoom-leagues] /leagues: a[link-standings-team-14] "2STSeal Team Sticks (Muckers)" 25x44 (059-webkit-text-200-zoom-leagues.jpg)
- **tap target under 44 pt** [webkit, Read it with text at 200 percent / zoom-leagues] /leagues: a[link-standings-team-12] "3Hammer'd Heads" 25x44 (059-webkit-text-200-zoom-leagues.jpg)
- **tap target under 44 pt** [webkit, Read it with text at 200 percent / zoom-leagues] /leagues: a[link-standings-team-16] "4WPWild Puckers" 25x44 (059-webkit-text-200-zoom-leagues.jpg)
- **tap target under 44 pt** [webkit, Read it with text at 200 percent / zoom-leagues] /leagues: a[link-standings-team-10] "5BLBlue Liners" 25x44 (059-webkit-text-200-zoom-leagues.jpg)
- **tap target under 44 pt** [webkit, Read it with text at 200 percent / zoom-leagues] /leagues: a[link-standings-team-11] "6FIFighting Irish" 25x44 (059-webkit-text-200-zoom-leagues.jpg)
- **tap target under 44 pt** [webkit, Read it with text at 200 percent / zoom-leagues] /leagues: a[link-standings-team-13] "7HHHinson Hookers" 25x44 (059-webkit-text-200-zoom-leagues.jpg)
- **tap target under 44 pt** [webkit, Read it with text at 200 percent / zoom-leagues] /leagues: a[link-standings-team-9] "8BCBackside Checkers" 25x44 (059-webkit-text-200-zoom-leagues.jpg)
- **tap target under 44 pt** [webkit, Read it with text at 200 percent / zoom-settings] /settings: input[input-sharpen-every] "Sharpen every how many games" 30x44 (061-webkit-text-200-zoom-settings.jpg)
- **tap target under 44 pt** [chromium, Captain claims his team and shares the invite link / home-signed-out] /: a[nav-scan] "Scan scoresheet" 71x36 (071-chromium-captain-setup-home-signed-out.jpg)
- **tap target under 44 pt** [chromium, Captain claims his team and shares the invite link / me-claimed] /me: a "BLCBlue Liners#60 · No captain yet›" 326x42 (077-chromium-captain-setup-me-claimed.jpg)
- **tap target under 44 pt** [chromium, Captain claims his team and shares the invite link / me-captain] /me: a "BLCBlue Liners#60 · Captain›" 326x42 (078-chromium-captain-setup-me-captain.jpg)
- **tap target under 44 pt** [chromium, Captain claims his team and shares the invite link / manage] /team/10/manage: a[link-back-team] "‹ Back" 36x44 (079-chromium-captain-setup-manage.jpg)
- **tap target under 44 pt** [chromium, New player: invite link to his team in two minutes / me-claimed] /me: a "BLCBlue Liners#81 · Captain: Nick Tolliv" 326x42 (086-chromium-first-two-minutes-me-claimed.jpg)
- **tap target under 44 pt** [chromium, After the game: scan the sheet and send it / scan-reading] /sheet/3: button[chip-league-C] "C" 40x44 (096-chromium-scan-sheet-scan-reading.jpg)
- **tap target under 44 pt** [chromium, After the game: scan the sheet and send it / scan-reading] /sheet/3: input[input-goal-scorer-home-0] "Goal 1 scorer number, Home (Blue Liners)" 40x44 (096-chromium-scan-sheet-scan-reading.jpg)
- **tap target under 44 pt** [chromium, After the game: scan the sheet and send it / scan-reading] /sheet/3: input[input-goal-a1-home-0] "Goal 1 first assist number, Home (Blue L" 40x44 (096-chromium-scan-sheet-scan-reading.jpg)
- **tap target under 44 pt** [chromium, After the game: scan the sheet and send it / scan-reading] /sheet/3: input[input-goal-a2-home-0] "Goal 1 second assist number, Home (Blue " 40x44 (096-chromium-scan-sheet-scan-reading.jpg)
- **tap target under 44 pt** [chromium, After the game: scan the sheet and send it / scan-reading] /sheet/3: input[input-goal-scorer-away-0] "Goal 1 scorer number, Visitor (Fighting " 40x44 (096-chromium-scan-sheet-scan-reading.jpg)
- **tap target under 44 pt** [chromium, After the game: scan the sheet and send it / scan-reading] /sheet/3: input[input-goal-a1-away-0] "Goal 1 first assist number, Visitor (Fig" 40x44 (096-chromium-scan-sheet-scan-reading.jpg)
- **tap target under 44 pt** [chromium, After the game: scan the sheet and send it / scan-reading] /sheet/3: input[input-goal-a2-away-0] "Goal 1 second assist number, Visitor (Fi" 40x44 (096-chromium-scan-sheet-scan-reading.jpg)
- **tap target under 44 pt** [chromium, Read it with text at 200 percent / zoom-leagues] /leagues: a[link-standings-team-15] "1WDWhiskey Dekes" 25x80 (129-chromium-text-200-zoom-leagues.jpg)
- **tap target under 44 pt** [chromium, Read it with text at 200 percent / zoom-leagues] /leagues: a[link-standings-team-14] "2STSeal Team Sticks (Muckers)" 25x80 (129-chromium-text-200-zoom-leagues.jpg)
- **tap target under 44 pt** [chromium, Read it with text at 200 percent / zoom-leagues] /leagues: a[link-standings-team-12] "3Hammer'd Heads" 25x80 (129-chromium-text-200-zoom-leagues.jpg)
- **tap target under 44 pt** [chromium, Read it with text at 200 percent / zoom-leagues] /leagues: a[link-standings-team-10] "4BLBlue Liners" 25x80 (129-chromium-text-200-zoom-leagues.jpg)
- **tap target under 44 pt** [chromium, Read it with text at 200 percent / zoom-leagues] /leagues: a[link-standings-team-16] "5WPWild Puckers" 25x80 (129-chromium-text-200-zoom-leagues.jpg)
- **tap target under 44 pt** [chromium, Read it with text at 200 percent / zoom-leagues] /leagues: a[link-standings-team-11] "6FIFighting Irish" 25x80 (129-chromium-text-200-zoom-leagues.jpg)
- **tap target under 44 pt** [chromium, Read it with text at 200 percent / zoom-leagues] /leagues: a[link-standings-team-13] "7HHHinson Hookers" 25x80 (129-chromium-text-200-zoom-leagues.jpg)
- **tap target under 44 pt** [chromium, Read it with text at 200 percent / zoom-leagues] /leagues: a[link-standings-team-9] "8BCBackside Checkers" 25x80 (129-chromium-text-200-zoom-leagues.jpg)
- **tap target under 44 pt** [chromium, Read it with text at 200 percent / zoom-settings] /settings: input[input-sharpen-every] "Sharpen every how many games" 30x44 (131-chromium-text-200-zoom-settings.jpg)
- **text under 12 pt** [webkit, Captain claims his team and shares the invite link / me-waiting] /me: 11.52px "WD" (005-webkit-captain-setup-me-waiting.jpg)
- **text under 12 pt** [webkit, New player: invite link to his team in two minutes / home-first] /: 10px "WD"; 10px "WP"; 10.08px "FI"; 10.08px "BL" (017-webkit-first-two-minutes-home-first.jpg)
- **text under 12 pt** [webkit, Game night: captain checks who's in and posts the room / details-form] /team/15?details=1: 10px "WP" (021-webkit-game-night-captain-details-form.jpg)
- **text under 12 pt** [webkit, Captain confirms the sheet / game-in-books] /game/77/new: 10px "WD"; 10px "WP" (031-webkit-captain-confirm-game-in-books.jpg)
- **text under 12 pt** [webkit, Player sees his line and why his rating moved / game] /game/77: 10px "WD"; 10px "WP" (033-webkit-see-rating-move-game.jpg)
- **text under 12 pt** [webkit, Player sees his line and why his rating moved / player] /player/244: 10px "55"; 10px "WD"; 10px "WP"; 10px "HH" (034-webkit-see-rating-move-player.jpg)
- **text under 12 pt** [webkit, Where do we stand? / standings] /leagues: 10px "WD"; 10px "ST"; 10px "WP"; 10px "BL" (041-webkit-standings-standings.jpg)
- **text under 12 pt** [webkit, Where do we stand? / my-team] /team/15: 10px "WP" (042-webkit-standings-my-team.jpg)
- **text under 12 pt** [webkit, Teammate opens the shared game link, not signed in / game-link] /game/77?s=HBd_l1QzvVhAavzATAEEnd: 10px "WD"; 10px "WP" (063-webkit-shared-game-link-game-link.jpg)
- **text under 12 pt** [chromium, Captain claims his team and shares the invite link / me-waiting] /me: 11.52px "BL" (075-chromium-captain-setup-me-waiting.jpg)
- **text under 12 pt** [chromium, New player: invite link to his team in two minutes / home-first] /: 10px "BL"; 10px "FI"; 10.08px "WD"; 10.08px "WP" (087-chromium-first-two-minutes-home-first.jpg)
- **text under 12 pt** [chromium, Game night: captain checks who's in and posts the room / details-form] /team/10?details=3: 10px "FI" (091-chromium-game-night-captain-details-form.jpg)
- **text under 12 pt** [chromium, Captain confirms the sheet / game-in-books] /game/78: 10px "BL"; 10px "FI" (101-chromium-captain-confirm-game-in-books.jpg)
- **text under 12 pt** [chromium, Player sees his line and why his rating moved / player] /player/180: 10px "81"; 10px "BL"; 10px "FI"; 10px "HH" (104-chromium-see-rating-move-player.jpg)
- **text under 12 pt** [chromium, Where do we stand? / standings] /leagues: 10px "WD"; 10px "ST"; 10px "BL"; 10px "WP" (111-chromium-standings-standings.jpg)
- **text under 12 pt** [chromium, Where do we stand? / my-team] /team/10: 10px "FI" (112-chromium-standings-my-team.jpg)
- **text under 12 pt** [chromium, Teammate opens the shared game link, not signed in / game-link] /game/78?s=OcNmB8xT7mKQJkNgCfhpAL: 10px "BL"; 10px "FI" (133-chromium-shared-game-link-game-link.jpg)

## Screens

| Shot | Path | Height (screens) | First screen |
|---|---|---|---|
| 001-webkit-captain-setup-home-signed-out.jpg | / | 1.5 | · Midnight Pond Made-up teams and players. Sign in to see your # EVERY GAME COUNTS. EVEN THE 11:15. · Just played? Snap the sheet. One photo. We read every goal,  · Join your team Your schedule, your line and your rating, in  # Latest finals · Standings · A Thu, Nov 5 · 21:15 Final Zamboni Zombies 0 |
| 002-webkit-captain-setup-join.jpg | /join | 1 | # YOUR NUMBER. YOUR RATING. · Late Ice is invite-only for now. Without your captain's link · Email me a code · Sign in with Face ID or a passkey · terms · privacy |
| 003-webkit-captain-setup-code.jpg | /join | 1 | # YOUR NUMBER. YOUR RATING. · Change · Sign in · Send a new code in 60s |
| 004-webkit-captain-setup-profile.jpg | /join | 1.4 | # FOUR FIELDS. THAT'S THE WHOLE FORM. · Center · Wing · Defense · Goalie · United States · Canada · Midnight Pond Anytown, NC · 3 leagues |
| 005-webkit-captain-setup-me-waiting.jpg | /me | 1.1 | · You're on the waitlist You can look around. To claim your sp · Is this you? WD #51 Luke B. Whiskey Dekes · C League That's  · That's me · Luke Barone Center Late Ice Rating – Not rated yet # Luke Barone · Settings # My team |
| 006-webkit-captain-setup-me-let-in.jpg | /me | 1.4 | · Is this you? WD #51 Luke B. Whiskey Dekes · C League That's  · That's me · Luke Barone Center Late Ice Rating – Not rated yet # Luke Barone · Settings # My team · Find your spot Scoresheets often list a first name and last  |
| 007-webkit-captain-setup-me-claimed.jpg | /me | 1.5 | · 51 Luke Barone Center WD Whiskey Dekes #51 Late Ice Rating 4 # Luke Barone · Settings · WD Whiskey Dekes #51 · 4.10 ▲ 0.187 last 5 C level # My team · WD C Whiskey Dekes #51 · No captain yet › Sun Nov 8 vs WP Wi · WD C Whiskey Dekes #51 · No captain yet › · I'm the captain · Rating history Every g |
| 008-webkit-captain-setup-me-captain.jpg | /me | 1.6 | · 51 Luke Barone Center WD Whiskey Dekes #51 Late Ice Rating 4 # Luke Barone · Settings · WD Whiskey Dekes #51 · 4.10 ▲ 0.187 last 5 C level # My team · WD C Whiskey Dekes #51 · Captain › Sun Nov 8 vs WP Wild Puck · WD C Whiskey Dekes #51 · Captain › · Manage team · Rating history Every game, and wh |
| 009-webkit-captain-setup-manage.jpg | /team/15/manage | 2.5 | · ‹ Back # MANAGE TEAM · 15 / 25 Skaters 1 / 2 Goalies 0 On IR or away # Roster · #4 Chris V. Center · Not signed up yet 4.16 › · #10 Derek B. Defense · Not signed up yet 4.15 › · #15 Mark F. Wing · Not signed up yet 4.06 › · #18 Tom B. Wing · Not signed up yet 4.10 › · #19 Ben G. Center · Not signe |
| 010-webkit-captain-setup-invites-open.jpg | /team/15/manage | 2.8 | · #85 Josh B. Defense · Not signed up yet 4.17 › · #87 Sean H. Center · Not signed up yet 4.19 › · #94 Kyle T. Center · Not signed up yet 4.14 › · #28 Phil Q. Goalie · Not signed up yet 4.14 › · Add a player For a teammate who isn't in the app yet · Invites and the draft pool Share a link, or pull a |
| 011-webkit-captain-setup-invite-link.jpg | /team/15/manage | 2.9 | · #85 Josh B. Defense · Not signed up yet 4.17 › · #87 Sean H. Center · Not signed up yet 4.19 › · #94 Kyle T. Center · Not signed up yet 4.14 › · #28 Phil Q. Goalie · Not signed up yet 4.14 › · Add a player For a teammate who isn't in the app yet · Invites and the draft pool Share a link, or pull a |
| 012-webkit-first-two-minutes-invite-landing.jpg | /join?invite=i28xOks5rPbcnNP7 | 1 | # YOUR NUMBER. YOUR RATING. · You're invited to join Whiskey Dekes. Sign in and you're in. · Email me a code · Sign in with Face ID or a passkey · terms · privacy |
| 013-webkit-first-two-minutes-code.jpg | /join?invite=i28xOks5rPbcnNP7 | 1 | # YOUR NUMBER. YOUR RATING. · You're invited to join Whiskey Dekes. Sign in and you're in. · Change · Sign in · Send a new code in 60s |
| 014-webkit-first-two-minutes-profile.jpg | /join?invite=i28xOks5rPbcnNP7 | 1.5 | # FOUR FIELDS. THAT'S THE WHOLE FORM. · You're invited to join Whiskey Dekes (C League, Polar Ice Wi · Center · Wing · Defense · Goalie · United States · Canada |
| 015-webkit-first-two-minutes-me-first.jpg | /me | 1.5 | · Is this you? WD #55 Paul K. Whiskey Dekes · C League That's  · That's me · Paul Kuehn Wing Late Ice Rating – Not rated yet # Paul Kuehn · Settings # My team · Find your spot Scoresheets often list a first name and last  |
| 016-webkit-first-two-minutes-me-claimed.jpg | /me | 1.5 | · 55 Paul Kuehn Wing WD Whiskey Dekes #55 Late Ice Rating 4.12 # Paul Kuehn · Settings · WD Whiskey Dekes #55 · 4.12 ▲ 0.187 last 5 C level # My team · WD C Whiskey Dekes #55 · Captain: Luke Barone › Sun Nov 8 vs · WD C Whiskey Dekes #55 · Captain: Luke Barone › · Rating history Every game, and why  |
| 017-webkit-first-two-minutes-home-first.jpg | / | 1.6 | # Tonight · WD Whiskey Dekes No answers yet Sun Nov 8 vs WP Wild Puckers · Whiskey Dekes · In · Late · Out · Scout Wild Puckers · Lineup · Schedule · Last game · Sun, Nov 1 W 8-1 vs Hinson Hookers Rating 4.12 + · Just played? Snap the sheet # Latest in C League · All results · C Sun, Nov 1 · 11:15 P |
| 018-webkit-game-night-in-home.jpg | / | 1.6 | # Tonight · WD Whiskey Dekes No answers yet Sun Nov 8 vs WP Wild Puckers · Whiskey Dekes · In · Late · Out · Scout Wild Puckers · Lineup · Schedule · Last game · Sun, Nov 1 W 8-1 vs Hinson Hookers Rating 4.12 + · Just played? Snap the sheet # Latest in C League · All results · C Sun, Nov 1 · 11:15 P |
| 019-webkit-game-night-in-said-in.jpg | / | 1.6 | # Tonight · WD Whiskey Dekes 1 in Sun Nov 8 vs WP Wild Puckers 9:15 PM · · Whiskey Dekes · In · Late · Out · Scout Wild Puckers · Lineup · Schedule · Last game · Sun, Nov 1 W 8-1 vs Hinson Hookers Rating 4.12 + · Just played? Snap the sheet # Latest in C League · All results · C Sun, Nov 1 · 11:15 P |
| 020-webkit-game-night-captain-home.jpg | / | 1.8 | # Tonight · WD Whiskey Dekes 1 in Sun Nov 8 vs WP Wild Puckers 9:15 PM · · Whiskey Dekes · In · Late · Out · Find a goalie sub · Scout Wild Puckers · Lineup · Set sheet & room · Schedule · Last game · Sun, Nov 1 W 8-1 vs Hinson Hookers Rating 4.10 + · Just played? Snap the sheet · All results |
| 021-webkit-game-night-captain-details-form.jpg | /team/15?details=1 | 4.1 | # Schedule · Add a game · Remove · In · Late · Out · 1 in · 1 no answer ▾ · Set the lineup › · Find a goalie sub · Find a sub · Close · Save details · Next in turn |
| 022-webkit-game-night-captain-details-saved.jpg | /team/15?details=1 | 4.1 | # Schedule · Add a game · Remove · In · Late · Out · 1 in · 1 no answer ▾ · Set the lineup › · Find a goalie sub · Find a sub · Close · Save details |
| 023-webkit-game-night-captain-home-after.jpg | / | 1.8 | # Tonight · WD Whiskey Dekes 1 in Sun Nov 8 vs WP Wild Puckers 9:15 PM · · Whiskey Dekes · In · Late · Out · Find a goalie sub · Scout Wild Puckers · Lineup · Edit details · Schedule · Last game · Sun, Nov 1 W 8-1 vs Hinson Hookers Rating 4.10 + · Just played? Snap the sheet |
| 024-webkit-game-night-room-home.jpg | / | 1.7 | # Tonight · WD Whiskey Dekes 1 in Sun Nov 8 vs WP Wild Puckers 9:15 PM · · Whiskey Dekes · In · Late · Out · Scout Wild Puckers · Lineup · Schedule · Last game · Sun, Nov 1 W 8-1 vs Hinson Hookers Rating 4.12 + · Just played? Snap the sheet # Latest in C League · All results · C Sun, Nov 1 · 11:15 P |
| 025-webkit-scan-sheet-scan.jpg | /scan | 1 | # SNAP THE SHEET · Take photo · Upload |
| 026-webkit-scan-sheet-scan-reading.jpg | /sheet/1 | 1.9 | · Back · View photo · C · Goals 5 · Rosters 28 · Penalties 2 · Send to the captains to confirm |
| 027-webkit-scan-sheet-review.jpg | /sheet/1 | 1.9 | · Back · View photo · C · Goals 5 · Rosters 28 · Penalties 2 · Send to the captains to confirm |
| 028-webkit-scan-sheet-sent.jpg | /sheet/1 | 1.9 | · Back · View photo · C · Goals 5 · Rosters 28 · Penalties 2 |
| 029-webkit-captain-confirm-home.jpg | / | 1.9 | # Tonight · A sheet is waiting for you to confirm Whiskey Dekes vs Wild  · WD Whiskey Dekes 1 in Sun Nov 8 vs WP Wild Puckers 9:15 PM · · Whiskey Dekes · In · Late · Out · Find a goalie sub · Scout Wild Puckers · Lineup · Edit details · Schedule · Last game · Sun, Nov 1 W 8-1 vs Hinson Hookers Ratin |
| 030-webkit-captain-confirm-sheet-to-confirm.jpg | /sheet/1 | 1.9 | · Back · View photo · C · Goals 5 · Rosters 28 · Penalties 2 · Confirm final · C · 3–2 |
| 031-webkit-captain-confirm-game-in-books.jpg | /game/77/new | 4.1 | · Back · WD Whiskey Dekes · WP Wild Puckers · Share this result # Three stars · ★★★ Paul Kuehn 1G 1A +0.022 · ★★ Chris M. 1G 1A −0.006 · ★ Derek B. 0G 1A +0.018 |
| 032-webkit-see-rating-move-home.jpg | / | 1.7 | # Tonight · WD Whiskey Dekes 1 in Sun Nov 8 vs WP Wild Puckers 9:15 PM · · Whiskey Dekes · In · Late · Out · Scout Wild Puckers · Lineup · Schedule · Last game · Sun, Nov 8 W 3-2 vs Wild Puckers Rating 4.14 +0. · Just played? Snap the sheet # Latest in C League · All results · C Sun, Nov 8 · 9:15 PM |
| 033-webkit-see-rating-move-game.jpg | /game/77 | 4 | · Back · WD Whiskey Dekes · WP Wild Puckers · Share this result # Three stars · ★★★ Paul Kuehn 1G 1A +0.022 · ★★ Chris M. 1G 1A −0.006 · ★ Derek B. 0G 1A +0.018 # Scoring |
| 034-webkit-see-rating-move-player.jpg | /player/244 | 1.9 | · Back · 55 Paul Kuehn Wing WD Whiskey Dekes #55 Late Ice Rating 4.14 # Paul Kuehn · WD Whiskey Dekes #55 · 4.14 ▲ 0.167 last 5 C level · Career, milestones and goalie numbers › |
| 035-webkit-see-rating-move-why-open.jpg | /player/244 | 2.1 | · Career, milestones and goalie numbers › # Why it moved · W WP 3–2 vs Wild Puckers Sun, Nov 8 +0.022 · Game › · W HH 8–1 vs Hinson Hookers Sun, Nov 1 +0.019 · W BC 4–0 vs Backside Checkers Sun, Oct 25 +0.019 · W 4–0 vs Hammer'd Heads Sun, Oct 11 +0.022 |
| 036-webkit-scan-failed-scan.jpg | /scan | 1 | # SNAP THE SHEET · Take photo · Upload |
| 037-webkit-scan-failed-fail-reading.jpg | /sheet/2 | 1 | · Back · Retry with a new photo · Enter the score by hand · Send to the captain |
| 038-webkit-scan-failed-stuck.jpg | /sheet/2 | 1 | · Back · Retry with a new photo · Enter the score by hand · Send to the captain |
| 039-webkit-scan-failed-by-hand.jpg | /sheet/2 | 1.3 | · Back · Retry with a new photo · Enter the score by hand · Send to the captain |
| 040-webkit-scan-failed-by-hand-saved.jpg | /sheet/2 | 1.7 | · Back · View photo · C · Goals 0 · Rosters 16 · Penalties 0 · Send to the captains to confirm |
| 041-webkit-standings-standings.jpg | /leagues | 1 | # Standings · C C League 81 games · Leaders and results › Team GP W-L-T DI · C C League 81 games · Leaders and results › · 1 WD Whiskey Dekes · 2 ST Seal Team Sticks (Muckers) · 3 Hammer'd Heads · 4 WP Wild Puckers · 5 BL Blue Liners · 6 FI Fighting Irish · 7 HH Hinson Hookers · 8 BC Backside Checke |
| 042-webkit-standings-my-team.jpg | /team/15 | 3.2 | · Back # Whiskey Dekes · Captain Luke Barone Contest · Contest # Schedule · In · Late · Out · 1 in · 1 no answer ▾ · Lineup › |
| 043-webkit-find-player-players.jpg | /players | 1.6 | # Players · Find a player · Skaters · Center · Wing · Defense · Goalie · 11 You · W Whiskey Dekes · C 4.14 +0.022 · 1 Ben G. · C Whiskey Dekes · C 4.21 +0.018 · 2 Sean H. · C Whiskey Dekes · C 4.21 +0.014 · 3 Alex P. · C Whiskey Dekes · C 4.20 +0.014 · 4 Chris V. · C Whiskey Dekes · C 4.18 +0.018 ·  |
| 044-webkit-find-player-search-surname.jpg | /players | 1.6 | # Players · Find a player · Skaters · Center · Wing · Defense · Goalie · 1 Cole M. · D Seal Team Sticks (Muckers) · C 4.09 +0.027 · 2 Dan M. Hammer'd Heads · C 3.79 +0.004 · 3 Ben M. Hammer'd Heads · C 3.75 +0.000 · 4 Eric M. · D Blue Liners · C 3.73 +0.003 · 5 Steven M. Hammer'd Heads · C 3.73 +0.0 |
| 045-webkit-find-player-player.jpg | /player/229 | 2.2 | · Back · 40 Cole M. Defense · Unclaimed ST Seal Team Sticks (Muckers) # Cole M. · ST Seal Team Sticks (Muckers) #40 · 4.09 ▲ 0.081 last 5 C level · Career, milestones and goalie numbers › |
| 046-webkit-settings-me.jpg | /me | 1.2 | · 55 Paul Kuehn Wing WD Whiskey Dekes #55 Late Ice Rating 4.14 # Paul Kuehn · Settings · WD Whiskey Dekes #55 · 4.14 ▲ 0.167 last 5 C level # My team · WD C Whiskey Dekes #55 · Captain: Luke Barone › Sun Nov 8 vs · WD C Whiskey Dekes #55 · Captain: Luke Barone › · Notifications 1 new 1 · Rating hist |
| 047-webkit-settings-settings.jpg | /settings | 4 | · Back # Settings # Profile · Center · Wing · Defense · Goalie · United States · Canada · Midnight Pond Anytown, NC · 3 leagues · Polar Ice Wilmington Wilmington, NC · 1 league |
| 048-webkit-settings-light.jpg | /settings | 4 | · Use Face ID next time # Skates · Log the day you last had your skates sharpened and we'll rem · Sharpened today # Appearance · Match phone · Light · Dark # Notifications |
| 049-webkit-settings-status.jpg | /settings | 4 | · Midnight Pond Anytown, NC · 3 leagues · Polar Ice Wilmington Wilmington, NC · 1 league · Terms · Save # Availability · Active · Injured reserve · Away · Looking for a team · Will sub |
| 050-webkit-settings-notifications.jpg | /settings | 4 | # Appearance · Match phone · Light · Dark # Notifications · Allow # Privacy · Hide my name |
| 051-webkit-settings-home-light.jpg | / | 1.7 | # Tonight · WD Whiskey Dekes 1 in Sun Nov 8 vs WP Wild Puckers 9:15 PM · · Whiskey Dekes · In · Late · Out · Scout Wild Puckers · Lineup · Schedule · Last game · Sun, Nov 8 W 3-2 vs Wild Puckers Rating 4.14 +0. · Just played? Snap the sheet # Latest in C League · All results · C Sun, Nov 8 · 9:15 PM |
| 052-webkit-sign-out-in-ask-sign-out.jpg | /settings | 4.2 | · Hide my name · Hide my player type # Help · Help and common questions › · Email us › · Terms and privacy › · Sign out of Late Ice on this phone? Your teams and stats sta · Cancel · Sign out # Your data · Download my data Profile, teams, games, ratings and notices  · Delete my account Removes your  |
| 053-webkit-sign-out-in-signed-out.jpg | /join | 1 | # YOUR NUMBER. YOUR RATING. · Late Ice is invite-only for now. Without your captain's link · Email me a code · Sign in with Face ID or a passkey · terms · privacy |
| 054-webkit-sign-out-in-join.jpg | /join | 1 | # YOUR NUMBER. YOUR RATING. · Late Ice is invite-only for now. Without your captain's link · Email me a code · Sign in with Face ID or a passkey · terms · privacy |
| 055-webkit-sign-out-in-code.jpg | /join | 1 | # YOUR NUMBER. YOUR RATING. · Change · Sign in · Send a new code in 60s |
| 056-webkit-sign-out-in-back-in.jpg | /me | 1.2 | · 55 Paul Kuehn Wing WD Whiskey Dekes #55 Late Ice Rating 4.14 # Paul Kuehn · Settings · WD Whiskey Dekes #55 · 4.14 ▲ 0.167 last 5 C level # My team · WD C Whiskey Dekes #55 · Captain: Luke Barone › Sun Nov 8 vs · WD C Whiskey Dekes #55 · Captain: Luke Barone › · Notifications 1 new 1 · Rating hist |
| 057-webkit-text-200-zoom-.jpg | / | 3.1 | # Tonight · WD Whiskey Dekes 1 in Sun Nov 8 vs WP Wild Puckers 9:15 PM · · Whiskey Dekes · In · Late · Out · Scout Wild Puckers |
| 058-webkit-text-200-zoom-me.jpg | /me | 2 | · 55 Paul Kuehn Wing WD Whiskey Dekes #55 Late Ice Rating 4.14 # Paul Kuehn · Settings · WD Whiskey Dekes #55 · 4.14 ▲ 0.167 last 5 C level # My team · WD C Whiskey Dekes #55 · Captain: Luke Barone › Sun Nov 8 vs · WD C Whiskey Dekes #55 · Captain: Luke Barone › |
| 059-webkit-text-200-zoom-leagues.jpg | /leagues | 2.1 | # Standings · C C League 81 games · Leaders and results › Team GP W-L-T DI · C C League 81 games · Leaders and results › · 1 WD · 2 ST · 3 |
| 060-webkit-text-200-zoom-team-15.jpg | /team/15 | 6.4 | · Back # Whiskey Dekes |
| 061-webkit-text-200-zoom-settings.jpg | /settings | 8.6 | · Back # Settings # Profile · Center · Wing · Defense · Goalie |
| 062-webkit-text-200-zoom-game-77.jpg | /game/77 | 8.2 | · Back · WD Whiskey Dekes · WP Wild Puckers · Share this result |
| 063-webkit-shared-game-link-game-link.jpg | /game/77?s=HBd_l1QzvVhAavzATAEEnd | 1.4 | · Midnight Pond Made-up teams and players. Sign in to see your # Scoring |
| 064-webkit-leaver-signup-join.jpg | /join | 1 | # YOUR NUMBER. YOUR RATING. · Late Ice is invite-only for now. Without your captain's link · Email me a code · Sign in with Face ID or a passkey · terms · privacy |
| 065-webkit-leaver-signup-code.jpg | /join | 1 | # YOUR NUMBER. YOUR RATING. · Change · Sign in · Send a new code in 60s |
| 066-webkit-leaver-signup-profile.jpg | /join | 1.4 | # FOUR FIELDS. THAT'S THE WHOLE FORM. · Center · Wing · Defense · Goalie · United States · Canada · Midnight Pond Anytown, NC · 3 leagues |
| 067-webkit-delete-account-me.jpg | /me | 1 | · You're on the waitlist You can look around. To claim your sp · Dana Leaving Defense Late Ice Rating – Not rated yet # Dana Leaving · Settings # My team |
| 068-webkit-delete-account-settings.jpg | /settings | 4 | · Back to Me # Settings # Profile · Center · Wing · Defense · Goalie · United States · Canada · Midnight Pond Anytown, NC · 3 leagues · Polar Ice Wilmington Wilmington, NC · 1 league |
| 069-webkit-delete-account-ask-delete.jpg | /settings | 4.1 | · Hide my name · Hide my player type # Help · Help and common questions › · Email us › · Terms and privacy › · Sign out # Your data · Download my data Profile, teams, games, ratings and notices  · Delete my account Removes your name; past scores stay · Delete your Late Ice account? Your name comes o |
| 070-webkit-delete-account-deleted.jpg | /join | 1 | # YOUR NUMBER. YOUR RATING. · Late Ice is invite-only for now. Without your captain's link · Email me a code · Sign in with Face ID or a passkey · terms · privacy |
| 071-chromium-captain-setup-home-signed-out.jpg | / | 1.5 | · Midnight Pond Made-up teams and players. Sign in to see your # EVERY GAME COUNTS. EVEN THE 11:15. · Just played? Snap the sheet. One photo. We read every goal,  · Join your team Your schedule, your line and your rating, in  # Latest finals · Standings · A Thu, Nov 5 · 21:15 Final Zamboni Zombies 0 |
| 072-chromium-captain-setup-join.jpg | /join | 1 | # YOUR NUMBER. YOUR RATING. · Late Ice is invite-only for now. Without your captain's link · Email me a code · Sign in with Face ID or a passkey · terms · privacy |
| 073-chromium-captain-setup-code.jpg | /join | 1 | # YOUR NUMBER. YOUR RATING. · Change · Sign in · Send a new code in 60s |
| 074-chromium-captain-setup-profile.jpg | /join | 1.4 | # FOUR FIELDS. THAT'S THE WHOLE FORM. · Center · Wing · Defense · Goalie · United States · Canada · Midnight Pond Anytown, NC · 3 leagues |
| 075-chromium-captain-setup-me-waiting.jpg | /me | 1.1 | · You're on the waitlist You can look around. To claim your sp · Is this you? BL #60 Nick T. Blue Liners · C League That's me · That's me · Nick Tolliver Center Late Ice Rating – Not rated yet # Nick Tolliver · Settings # My team |
| 076-chromium-captain-setup-me-let-in.jpg | /me | 1.6 | · Is this you? BL #60 Nick T. Blue Liners · C League That's me · That's me · Nick Tolliver Center Late Ice Rating – Not rated yet # Nick Tolliver · Settings # My team · Find your spot Scoresheets often list a first name and last  |
| 077-chromium-captain-setup-me-claimed.jpg | /me | 1.7 | · 60 Nick Tolliver Center BL Blue Liners #60 Late Ice Rating 3 # Nick Tolliver · Settings · BL Blue Liners #60 · 3.78 ▼ 0.017 last 5 C level # My team · BL C Blue Liners #60 · No captain yet › Sun Nov 8 vs FI Figh · BL C Blue Liners #60 · No captain yet › · I'm the captain · Rating history Every gam |
| 078-chromium-captain-setup-me-captain.jpg | /me | 1.8 | · 60 Nick Tolliver Center BL Blue Liners #60 Late Ice Rating 3 # Nick Tolliver · Settings · BL Blue Liners #60 · 3.78 ▼ 0.017 last 5 C level # My team · BL C Blue Liners #60 · Captain › Sun Nov 8 vs FI Fighting Ir · BL C Blue Liners #60 · Captain › · Manage team · Rating history Every game, and why  |
| 079-chromium-captain-setup-manage.jpg | /team/10/manage | 2.5 | · ‹ Back # MANAGE TEAM · 15 / 25 Skaters 1 / 2 Goalies 0 On IR or away # Roster · #5 Brian I. Defense · Not signed up yet 3.80 › · #25 Zach L. Wing · Not signed up yet 3.84 › · #27 Trent A. Wing · Not signed up yet 3.73 › · #29 Wes S. Defense · Not signed up yet 3.70 › · #33 Mike P. Defense · Not si |
| 080-chromium-captain-setup-invites-open.jpg | /team/10/manage | 2.8 | · Add a player For a teammate who isn't in the app yet · Invites and the draft pool Share a link, or pull a registere · Open the draft pool · Invite link Anyone who joins through it is let in and lands  · Make an invite link · Leadership Assistant captains and handing off the captaincy · Team Name,  |
| 081-chromium-captain-setup-invite-link.jpg | /team/10/manage | 2.9 | · Invites and the draft pool Share a link, or pull a registere · Open the draft pool · Invite link Anyone who joins through it is let in and lands  · Share link · Turn off link · Leadership Assistant captains and handing off the captaincy · Team Name, colors and the calendar feed · Step down as capt |
| 082-chromium-first-two-minutes-invite-landing.jpg | /join?invite=RmdN-iCYHwmRRMsb | 1 | # YOUR NUMBER. YOUR RATING. · You're invited to join Blue Liners. Sign in and you're in. · Email me a code · Sign in with Face ID or a passkey · terms · privacy |
| 083-chromium-first-two-minutes-code.jpg | /join?invite=RmdN-iCYHwmRRMsb | 1 | # YOUR NUMBER. YOUR RATING. · You're invited to join Blue Liners. Sign in and you're in. · Change · Sign in · Send a new code in 60s |
| 084-chromium-first-two-minutes-profile.jpg | /join?invite=RmdN-iCYHwmRRMsb | 1.5 | # FOUR FIELDS. THAT'S THE WHOLE FORM. · You're invited to join Blue Liners (C League, Polar Ice Wilm · Center · Wing · Defense · Goalie · United States · Canada |
| 085-chromium-first-two-minutes-me-first.jpg | /me | 1.4 | · Is this you? BL #81 Paul N. Blue Liners · C League That's me · That's me · Paul Novak Wing Late Ice Rating – Not rated yet # Paul Novak · Settings # My team · Find your spot Scoresheets often list a first name and last  |
| 086-chromium-first-two-minutes-me-claimed.jpg | /me | 1.4 | · 81 Paul Novak Wing BL Blue Liners #81 Late Ice Rating 3.81 ▼ # Paul Novak · Settings · BL Blue Liners #81 · 3.81 ▼ 0.065 last 5 C level # My team · BL C Blue Liners #81 · Captain: Nick Tolliver › Sun Nov 8 vs · BL C Blue Liners #81 · Captain: Nick Tolliver › · Rating history Every game, and why yo |
| 087-chromium-first-two-minutes-home-first.jpg | / | 1.7 | # Tonight · BL Blue Liners No answers yet Sun Nov 8 vs FI Fighting Irish · Blue Liners · In · Late · Out · Scout Fighting Irish · Lineup · Schedule · Last game · Sun, Nov 1 T 4-4 vs Fighting Irish Rating 3.81 + · Just played? Snap the sheet # Latest in C League · All results · C Sun, Nov 8 · 9:15 PM |
| 088-chromium-game-night-in-home.jpg | / | 1.7 | # Tonight · BL Blue Liners No answers yet Sun Nov 8 vs FI Fighting Irish · Blue Liners · In · Late · Out · Scout Fighting Irish · Lineup · Schedule · Last game · Sun, Nov 1 T 4-4 vs Fighting Irish Rating 3.81 + · Just played? Snap the sheet # Latest in C League · All results · C Sun, Nov 8 · 9:15 PM |
| 089-chromium-game-night-in-said-in.jpg | / | 1.7 | # Tonight · BL Blue Liners 1 in Sun Nov 8 vs FI Fighting Irish 9:15 PM · · Blue Liners · In · Late · Out · Scout Fighting Irish · Lineup · Schedule · Last game · Sun, Nov 1 T 4-4 vs Fighting Irish Rating 3.81 + · Just played? Snap the sheet # Latest in C League · All results · C Sun, Nov 8 · 9:15 PM |
| 090-chromium-game-night-captain-home.jpg | / | 1.8 | # Tonight · BL Blue Liners 1 in Sun Nov 8 vs FI Fighting Irish 9:15 PM · · Blue Liners · In · Late · Out · Find a goalie sub · Scout Fighting Irish · Lineup · Set sheet & room · Schedule · Last game · Sun, Nov 1 T 4-4 vs Fighting Irish Rating 3.78 + · Just played? Snap the sheet |
| 091-chromium-game-night-captain-details-form.jpg | /team/10?details=3 | 4.1 | · Remove · In · Late · Out · 2 no answer ▾ · Set the lineup › · Find a sub · Tonight's details · Team calendar In the Dash by DaySmart app or the league webs · Connect # Roster · #70 Steve B. 8 GP · 5 G · 6 A 3.76 |
| 092-chromium-game-night-captain-details-saved.jpg | /team/10?details=3 | 4.1 | · Remove · In · Late · Out · 2 no answer ▾ · Set the lineup › · Find a sub · Tonight's details · Team calendar In the Dash by DaySmart app or the league webs · Connect # Roster · #70 Steve B. 8 GP · 5 G · 6 A 3.76 · #81 Paul Novak 10 GP · 4 G · 5 A · Registered 3.81 · #47 Eric N. 9 GP · 5 G · 3 A 3. |
| 093-chromium-game-night-captain-home-after.jpg | / | 1.8 | # Tonight · BL Blue Liners 1 in Sun Nov 8 vs FI Fighting Irish 9:15 PM · · Blue Liners · In · Late · Out · Find a goalie sub · Scout Fighting Irish · Lineup · Edit details · Schedule · Last game · Sun, Nov 1 T 4-4 vs Fighting Irish Rating 3.78 + · Just played? Snap the sheet |
| 094-chromium-game-night-room-home.jpg | / | 1.7 | # Tonight · BL Blue Liners 1 in Sun Nov 8 vs FI Fighting Irish 9:15 PM · · Blue Liners · In · Late · Out · Scout Fighting Irish · Lineup · Schedule · Last game · Sun, Nov 1 T 4-4 vs Fighting Irish Rating 3.81 + · Just played? Snap the sheet # Latest in C League · All results |
| 095-chromium-scan-sheet-scan.jpg | /scan | 1 | # SNAP THE SHEET · Take photo · Upload |
| 096-chromium-scan-sheet-scan-reading.jpg | /sheet/3 | 1.9 | · Back · View photo · C · Goals 5 · Rosters 28 · Penalties 2 · Send to the captains to confirm |
| 097-chromium-scan-sheet-review.jpg | /sheet/3 | 1.9 | · Back · View photo · C · Goals 5 · Rosters 28 · Penalties 2 · Send to the captains to confirm |
| 098-chromium-scan-sheet-sent.jpg | /sheet/3 | 1.9 | · Back · View photo · C · Goals 5 · Rosters 28 · Penalties 2 |
| 099-chromium-captain-confirm-home.jpg | / | 1.9 | # Tonight · A sheet is waiting for you to confirm Blue Liners vs Fightin · BL Blue Liners 1 in Sun Nov 8 vs FI Fighting Irish 9:15 PM · · Blue Liners · In · Late · Out · Find a goalie sub · Scout Fighting Irish · Lineup · Edit details · Schedule · Last game · Sun, Nov 1 T 4-4 vs Fighting Irish Ratin |
| 100-chromium-captain-confirm-sheet-to-confirm.jpg | /sheet/3 | 1.9 | · Back · View photo · C · Goals 5 · Rosters 28 · Penalties 2 · Confirm final · C · 3–2 |
| 101-chromium-captain-confirm-game-in-books.jpg | /game/78 | 3.5 | · Back · BL Blue Liners · FI Fighting Irish · Share this result # Three stars · ★★★ Paul Novak 1G 1A +0.040 · ★★ Nick S. 1G 1A −0.024 · ★ Mike P. 0G 1A +0.036 # Scoring |
| 102-chromium-see-rating-move-home.jpg | / | 1.7 | # Tonight · BL Blue Liners 1 in Sun Nov 8 vs FI Fighting Irish 9:15 PM · · Blue Liners · In · Late · Out · Scout Fighting Irish · Lineup · Schedule · Last game · Sun, Nov 8 W 3-2 vs Fighting Irish Rating 3.85 + · Just played? Snap the sheet # Latest in C League · All results |
| 103-chromium-see-rating-move-game.jpg | /game/78 | 3.5 | · Back · BL Blue Liners · FI Fighting Irish · Share this result # Three stars · ★★★ Paul Novak 1G 1A +0.040 · ★★ Nick S. 1G 1A −0.024 · ★ Mike P. 0G 1A +0.036 # Scoring |
| 104-chromium-see-rating-move-player.jpg | /player/180 | 2.1 | · Back · 81 Paul Novak Wing BL Blue Liners #81 Late Ice Rating 3.85 ▼ # Paul Novak · BL Blue Liners #81 · 3.85 ▼ 0.021 last 5 C level · Career, milestones and goalie numbers › |
| 105-chromium-see-rating-move-why-open.jpg | /player/180 | 2.3 | · L HH 1–6 vs Hinson Hookers Sun, Oct 25 −0.050 · L WD 5–7 vs Whiskey Dekes Sun, Oct 18 −0.018 · T BC 2–2 vs Backside Checkers Sun, Oct 11 +0.000 · T 4–4 vs Hammer'd Heads Sun, Oct 4 −0.004 · L ST 3–4 vs Seal Team Sticks (Muckers) Sun, Sep 27 −0.053 · W WP 5–4 vs Wild Puckers Sun, Sep 20 +0.067 · W  |
| 106-chromium-scan-failed-scan.jpg | /scan | 1 | # SNAP THE SHEET · Take photo · Upload |
| 107-chromium-scan-failed-fail-reading.jpg | /sheet/4 | 1 | · Back · Retry with a new photo · Enter the score by hand · Send to the captain |
| 108-chromium-scan-failed-stuck.jpg | /sheet/4 | 1 | · Back · Retry with a new photo · Enter the score by hand · Send to the captain |
| 109-chromium-scan-failed-by-hand.jpg | /sheet/4 | 1.3 | · Back · Retry with a new photo · Enter the score by hand · Send to the captain |
| 110-chromium-scan-failed-by-hand-saved.jpg | /sheet/4 | 1.7 | · Back · View photo · C · Goals 0 · Rosters 16 · Penalties 0 · Send to the captains to confirm |
| 111-chromium-standings-standings.jpg | /leagues | 1 | # Standings · C C League 82 games · Leaders and results › Team GP W-L-T DI · C C League 82 games · Leaders and results › · 1 WD Whiskey Dekes · 2 ST Seal Team Sticks (Muckers) · 3 Hammer'd Heads · 4 BL Blue Liners · 5 WP Wild Puckers · 6 FI Fighting Irish · 7 HH Hinson Hookers · 8 BC Backside Checke |
| 112-chromium-standings-my-team.jpg | /team/10 | 3.2 | · Back # Blue Liners · Captain Nick Tolliver Contest · Contest # Schedule · In · Late · Out · 1 in · 1 no answer ▾ · Lineup › |
| 113-chromium-find-player-players.jpg | /players | 1.6 | # Players · Find a player · Skaters · Center · Wing · Defense · Goalie · 43 You · W Blue Liners · C 3.85 +0.040 · 1 Ben G. · C Whiskey Dekes · C 4.21 +0.018 · 2 Sean H. · C Whiskey Dekes · C 4.21 +0.014 · 3 Alex P. · C Whiskey Dekes · C 4.20 +0.014 · 4 Chris V. · C Whiskey Dekes · C 4.18 +0.018 · 5  |
| 114-chromium-find-player-search-surname.jpg | /players | 1.7 | # Players · Find a player · Skaters · Center · Wing · Defense · Goalie · 1 Bill S. · W Seal Team Sticks (Muckers) · C 4.11 +0.027 · 2 Evan S. · D Seal Team Sticks (Muckers) · C 4.08 +0.027 · 3 Kyle S. · W Fighting Irish · C 3.90 −0.032 · 4 Nick S. · W Fighting Irish · C 3.87 −0.024 · 5 Gary S. · C B |
| 115-chromium-find-player-player.jpg | /player/240 | 2.2 | · Back · 78 Bill S. Wing · Unclaimed ST Seal Team Sticks (Muckers) #7 # Bill S. · ST Seal Team Sticks (Muckers) #78 · 4.11 ▲ 0.095 last 5 C level · Career, milestones and goalie numbers › |
| 116-chromium-settings-me.jpg | /me | 1.2 | · 81 Paul Novak Wing BL Blue Liners #81 Late Ice Rating 3.85 ▼ # Paul Novak · Settings · BL Blue Liners #81 · 3.85 ▼ 0.021 last 5 C level # My team · BL C Blue Liners #81 · Captain: Nick Tolliver › Sun Nov 8 vs · BL C Blue Liners #81 · Captain: Nick Tolliver › · Notifications 1 new 1 · Rating histor |
| 117-chromium-settings-settings.jpg | /settings | 4 | · Back # Settings # Profile · Center · Wing · Defense · Goalie · United States · Canada · Midnight Pond Anytown, NC · 3 leagues · Polar Ice Wilmington Wilmington, NC · 1 league |
| 118-chromium-settings-light.jpg | /settings | 4 | · Allow # Privacy · Hide my name · Hide my player type # Help · Help and common questions › · Email us › · Terms and privacy › · Sign out # Your data |
| 119-chromium-settings-status.jpg | /settings | 4 | · Use Face ID next time # Skates · Log the day you last had your skates sharpened and we'll rem · Sharpened today # Appearance · Match phone · Light · Dark # Notifications |
| 120-chromium-settings-notifications.jpg | /settings | 4 | · Hide my name · Hide my player type # Help · Help and common questions › · Email us › · Terms and privacy › · Sign out # Your data · Download my data Profile, teams, games, ratings and notices  · Delete my account Removes your name; past scores stay · Terms |
| 121-chromium-settings-home-light.jpg | / | 1.7 | # Tonight · BL Blue Liners 1 in Sun Nov 8 vs FI Fighting Irish 9:15 PM · · Blue Liners · In · Late · Out · Scout Fighting Irish · Lineup · Schedule · Last game · Sun, Nov 8 W 3-2 vs Fighting Irish Rating 3.85 + · Just played? Snap the sheet # Latest in C League · All results |
| 122-chromium-sign-out-in-ask-sign-out.jpg | /settings | 4.1 | # Help · Help and common questions › · Email us › · Terms and privacy › · Sign out of Late Ice on this phone? Your teams and stats sta · Cancel · Sign out # Your data · Download my data Profile, teams, games, ratings and notices  · Delete my account Removes your name; past scores stay · Terms |
| 123-chromium-sign-out-in-signed-out.jpg | /join | 1 | # YOUR NUMBER. YOUR RATING. · Late Ice is invite-only for now. Without your captain's link · Email me a code · Sign in with Face ID or a passkey · terms · privacy |
| 124-chromium-sign-out-in-join.jpg | /join | 1 | # YOUR NUMBER. YOUR RATING. · Late Ice is invite-only for now. Without your captain's link · Email me a code · Sign in with Face ID or a passkey · terms · privacy |
| 125-chromium-sign-out-in-code.jpg | /join | 1 | # YOUR NUMBER. YOUR RATING. · Change · Sign in · Send a new code in 60s |
| 126-chromium-sign-out-in-back-in.jpg | /me | 1.2 | · 81 Paul Novak Wing BL Blue Liners #81 Late Ice Rating 3.85 ▼ # Paul Novak · Settings · BL Blue Liners #81 · 3.85 ▼ 0.021 last 5 C level # My team · BL C Blue Liners #81 · Captain: Nick Tolliver › Sun Nov 8 vs · BL C Blue Liners #81 · Captain: Nick Tolliver › · Notifications 1 new 1 · Rating histor |
| 127-chromium-text-200-zoom-.jpg | / | 5.2 | # Tonight · BL Blue Liners 1 in Sun Nov 8 vs FI Fighting Irish 9:15 PM · · Blue Liners · In · Late · Out |
| 128-chromium-text-200-zoom-me.jpg | /me | 3.4 | · 81 Paul Novak Wing BL Blue Liners #81 Late Ice Rating 3.85 ▼ # Paul Novak · Settings · BL Blue Liners #81 · 3.85 ▼ 0.021 last 5 C level |
| 129-chromium-text-200-zoom-leagues.jpg | /leagues | 7.7 | # Standings · C C League 82 games · Leaders and results › Team GP W-L-T DI · C C League 82 games · Leaders and results › |
| 130-chromium-text-200-zoom-team-10.jpg | /team/10 | 12.7 | · Back # Blue Liners |
| 131-chromium-text-200-zoom-settings.jpg | /settings | 18.7 | · Back # Settings # Profile |
| 132-chromium-text-200-zoom-game-78.jpg | /game/78 | 16.4 | · Back · BL Blue Liners · FI Fighting Irish |
| 133-chromium-shared-game-link-game-link.jpg | /game/78?s=OcNmB8xT7mKQJkNgCfhpAL | 1.4 | · Midnight Pond Made-up teams and players. Sign in to see your # Scoring |
| 134-chromium-leaver-signup-join.jpg | /join | 1 | # YOUR NUMBER. YOUR RATING. · Late Ice is invite-only for now. Without your captain's link · Email me a code · Sign in with Face ID or a passkey · terms · privacy |
| 135-chromium-leaver-signup-code.jpg | /join | 1 | # YOUR NUMBER. YOUR RATING. · Change · Sign in · Send a new code in 60s |
| 136-chromium-leaver-signup-profile.jpg | /join | 1.4 | # FOUR FIELDS. THAT'S THE WHOLE FORM. · Center · Wing · Defense · Goalie · United States · Canada · Midnight Pond Anytown, NC · 3 leagues |
| 137-chromium-delete-account-me.jpg | /me | 1 | · You're on the waitlist You can look around. To claim your sp · Dana Leaving Defense Late Ice Rating – Not rated yet # Dana Leaving · Settings # My team |
| 138-chromium-delete-account-settings.jpg | /settings | 4 | · Back # Settings # Profile · Center · Wing · Defense · Goalie · United States · Canada · Midnight Pond Anytown, NC · 3 leagues · Polar Ice Wilmington Wilmington, NC · 1 league |
| 139-chromium-delete-account-ask-delete.jpg | /settings | 4.1 | # Help · Help and common questions › · Email us › · Terms and privacy › · Sign out # Your data · Download my data Profile, teams, games, ratings and notices  · Delete my account Removes your name; past scores stay · Delete your Late Ice account? Your name comes off every rost · Keep my account · Del |
| 140-chromium-delete-account-deleted.jpg | /join | 1 | # YOUR NUMBER. YOUR RATING. · Late Ice is invite-only for now. Without your captain's link · Email me a code · Sign in with Face ID or a passkey · terms · privacy |
