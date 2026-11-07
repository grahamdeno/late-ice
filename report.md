# Late Ice UX audit

Engines: chromium, webkit. Phone 390x844 unless noted. 62 screens captured.

**Findings:** 0 blocker, 5 serious, 50 moderate, 4 minor

## Journeys

| Engine | Person | Job | Done | Taps | Time |
|---|---|---|---|---|---|
| chromium | visitor | Visitor browses standings, a team, a player and a game | yes | 4 | 7.4s |
| chromium | visitor | Visitor hits a missing page | yes | 0 | 5.2s |
| chromium | new-player | New player joins and finds their rating | yes | 6 | 8.5s |
| chromium | new-player | New player opens a game and the stars | yes | 0 | 1.1s |
| chromium | captain | Captain takes over a team and adds a player | yes | 10 | 9.6s |
| chromium | captain | Captain schedules next game and sets tonight's details | yes | 4 | 8.7s |
| chromium | captain | Captain fixes a missing goalie | yes | 1 | 3.3s |
| chromium | captain | Captain sets a lineup | yes | 4 | 5.1s |
| chromium | captain | Captain scouts tonight's opponent | yes | 1 | 2.1s |
| chromium | captain | Scorekeeper opens the scanner | yes | 1 | 1.1s |
| chromium | captain | Rink manager turns on three-stars voting | yes | 3 | 4.1s |
| chromium | conditions | Slow phone connection | yes | 0 | 6.6s |
| chromium | conditions | Signal drops mid-use | yes | 0 | 5.8s |
| chromium | conditions | Small phone, light mode, reduced motion | yes | 0 | 6.8s |
| webkit | visitor | Visitor browses standings, a team, a player and a game | yes | 4 | 12.3s |
| webkit | visitor | Visitor hits a missing page | yes | 0 | 5.4s |
| webkit | new-player | New player joins and finds their rating | yes | 6 | 9.4s |
| webkit | new-player | New player opens a game and the stars | yes | 1 | 2.4s |

## Serious (5)

- **a11y: document-title** [chromium, Signal drops mid-use / offline-standings] /: Documents must have <title> element to aid in navigation (1x) e.g. html (shot 040-chromium-conditions-offline-standings.png)
- **a11y: html-has-lang** [chromium, Signal drops mid-use / offline-standings] /: <html> element must have a lang attribute (1x) e.g. html (shot 040-chromium-conditions-offline-standings.png)
- **tap target under 24px** [chromium, Rink manager turns on three-stars voting / desk-home] /desk: a "All teams" 63x20 (shot 035-chromium-captain-desk-home.png)
- **tap target under 24px** [chromium, Rink manager turns on three-stars voting / desk-home] /desk: input[toggle-weekly-email] "" 20x20 (shot 035-chromium-captain-desk-home.png)
- **tap target under 24px** [chromium, Rink manager turns on three-stars voting / desk-home] /desk: a "Manage" 54x20 (shot 035-chromium-captain-desk-home.png)

## Moderate (50)

- **console error** [chromium, Signal drops mid-use / offline-banner] Failed to fetch RSC payload for http://localhost:3097/leagues. Falling back to browser navigation. TypeError: Failed to fetch
    at y (http://localhost:3097/_next/static/chunks/1255-b84741b894bb9354.js:1:40385)
    at async _ (http://local (shot 039-chromium-conditions-offline-banner.png)
- **no recent games** [chromium, New player opens a game and the stars / settings] Home shows no game to open (shot 015-chromium-new-player-settings.png)
- **tap target under 40px** [chromium, Visitor browses standings, a team, a player and a game / home] /: a[link-home-logo] "Late Ice home" 104x29 (shot 001-chromium-visitor-home.png)
- **tap target under 40px** [chromium, Visitor browses standings, a team, a player and a game / home] /: button[button-league-switcher] "Polar Ice Wilmington" 186x36 (shot 001-chromium-visitor-home.png)
- **tap target under 40px** [chromium, Visitor browses standings, a team, a player and a game / home] /: a[nav-scan] "Scan scoresheet" 71x36 (shot 001-chromium-visitor-home.png)
- **tap target under 40px** [chromium, Visitor browses standings, a team, a player and a game / player] /player/17: a[link-card-team-12] "Hammer'd Heads" 160x36 (shot 004-chromium-visitor-player.png)
- **tap target under 40px** [chromium, New player joins and finds their rating / join-profile] /join: button[button-country-US] "United States" 116x36 (shot 012-chromium-new-player-join-profile.png)
- **tap target under 40px** [chromium, New player joins and finds their rating / join-profile] /join: button[button-country-CA] "Canada" 76x36 (shot 012-chromium-new-player-join-profile.png)
- **tap target under 40px** [chromium, New player joins and finds their rating / join-profile] /join: input[input-age] "" 24x24 (shot 012-chromium-new-player-join-profile.png)
- **tap target under 40px** [chromium, New player joins and finds their rating / players] /players: button[button-pos-skaters] "Skaters" 76x36 (shot 014-chromium-new-player-players.png)
- **tap target under 40px** [chromium, New player joins and finds their rating / players] /players: button[button-pos-C] "Center" 72x36 (shot 014-chromium-new-player-players.png)
- **tap target under 40px** [chromium, New player joins and finds their rating / players] /players: button[button-pos-W] "Wing" 58x36 (shot 014-chromium-new-player-players.png)
- **tap target under 40px** [chromium, New player joins and finds their rating / players] /players: button[button-pos-D] "Defense" 81x36 (shot 014-chromium-new-player-players.png)
- **tap target under 40px** [chromium, New player joins and finds their rating / players] /players: button[button-pos-G] "Goalie" 68x36 (shot 014-chromium-new-player-players.png)
- **tap target under 40px** [chromium, New player joins and finds their rating / settings] /settings: button[switch-lookingForTeam] "Looking for a team" 52x32 (shot 015-chromium-new-player-settings.png)
- **tap target under 40px** [chromium, New player joins and finds their rating / settings] /settings: button[switch-willSub] "Will sub" 52x32 (shot 015-chromium-new-player-settings.png)
- **tap target under 40px** [chromium, New player joins and finds their rating / settings] /settings: input[input-pref-game-day] "" 24x24 (shot 015-chromium-new-player-settings.png)
- **tap target under 40px** [chromium, New player joins and finds their rating / settings] /settings: input[input-pref-result] "" 24x24 (shot 015-chromium-new-player-settings.png)
- **tap target under 40px** [chromium, New player joins and finds their rating / settings] /settings: input[input-pref-sub-request] "" 24x24 (shot 015-chromium-new-player-settings.png)
- **tap target under 40px** [chromium, New player joins and finds their rating / settings] /settings: input[input-pref-roster] "" 24x24 (shot 015-chromium-new-player-settings.png)
- **tap target under 40px** [chromium, New player joins and finds their rating / settings] /settings: input[input-pref-confirm] "" 24x24 (shot 015-chromium-new-player-settings.png)
- **tap target under 40px** [chromium, New player joins and finds their rating / settings] /settings: button[switch-hidden] "Hide my name" 52x32 (shot 015-chromium-new-player-settings.png)
- **tap target under 40px** [chromium, New player joins and finds their rating / settings] /settings: button[switch-archetype-opt-out] "Hide my player type" 52x32 (shot 015-chromium-new-player-settings.png)
- **tap target under 40px** [chromium, Captain takes over a team and adds a player / me] /me: a[link-role-admin] "Admin ›" 75x36 (shot 019-chromium-captain-me.png)
- **tap target under 40px** [chromium, Captain takes over a team and adds a player / me-captain] /me: a[link-card-team-12] "Hammer'd Heads#12" 191x36 (shot 020-chromium-captain-me-captain.png)
- **tap target under 40px** [chromium, Captain takes over a team and adds a player / manage] /team/12/manage: a[link-back-team] "‹ Back" 36x44 (shot 021-chromium-captain-manage.png)
- **tap target under 40px** [chromium, Captain takes over a team and adds a player / manage-added] /team/12/manage: input[checkbox-spot-sub] "" 24x24 (shot 022-chromium-captain-manage-added.png)
- **tap target under 40px** [chromium, Captain schedules next game and sets tonight's details / home-next-game] /: button[button-scout] "Scout Backside Checkers" 174x32 (shot 026-chromium-captain-home-next-game.png)
- **tap target under 40px** [chromium, Captain schedules next game and sets tonight's details / home-next-game] /: a[link-all-results] "All results" 63x32 (shot 026-chromium-captain-home-next-game.png)
- **tap target under 40px** [chromium, Captain fixes a missing goalie / after-find-goalie] /team/12: button "Close" 48x36 (shot 029-chromium-captain-after-find-goalie.png)
- **tap target under 40px** [chromium, Captain scouts tonight's opponent / scout] /: button[button-scout] "Hide scouting" 94x32 (shot 033-chromium-captain-scout.png)
- **tap target under 40px** [chromium, Rink manager turns on three-stars voting / desk-season] /desk/season: input[toggle-star-voting-3] "" 24x24 (shot 036-chromium-captain-desk-season.png)
- **tap target under 40px** [chromium, Slow phone connection / home-slow-3g] /: button[button-league-switcher] "Late Ice" 98x36 (shot 038-chromium-conditions-home-slow-3g.png)
- **tap target under 40px** [chromium, Small phone, light mode, reduced motion / se-light-league-sheet] /: button[button-change-rink] "Change rink" 84x36 (shot 045-chromium-conditions-se-light-league-sheet.png)
- **tap target under 40px** [chromium, Small phone, light mode, reduced motion / se-light-league-sheet] /: a[link-rink-details] "Rink details" 78x36 (shot 045-chromium-conditions-se-light-league-sheet.png)
- **tap target under 40px** [chromium, Small phone, light mode, reduced motion / se-light-league-sheet] /: button[button-close-switcher] "Close" 36x36 (shot 045-chromium-conditions-se-light-league-sheet.png)
- **text under 12px** [chromium, Visitor browses standings, a team, a player and a game / home] /: 4 runs, e.g. 11px "Home"; 11px "Standings"; 11px "Players"; 11px "Join" (shot 001-chromium-visitor-home.png)
- **text under 12px** [chromium, Visitor browses standings, a team, a player and a game / standings] /leagues: 13 runs, e.g. 10px "ST"; 10px "WD"; 10px "WP"; 10px "BL" (shot 002-chromium-visitor-standings.png)
- **text under 12px** [chromium, Visitor browses standings, a team, a player and a game / team] /team/12: 8 runs, e.g. 11px "Record"; 11px "Points"; 11px "GF-GA"; 11px "Strength" (shot 003-chromium-visitor-team.png)
- **text under 12px** [chromium, Visitor browses standings, a team, a player and a game / player] /player/17: 9 runs, e.g. 11px "Totals include"; 11px "games imported from the"; 11px "Polar Ice Wilmington league stats page"; 11px "as of" (shot 004-chromium-visitor-player.png)
- **text under 12px** [chromium, Visitor browses standings, a team, a player and a game / career] /player/17/career: 5 runs, e.g. 11px "Counts games Late Ice has on record, inc"; 11px "Home"; 11px "Standings"; 11px "Players" (shot 005-chromium-visitor-career.png)
- **text under 12px** [chromium, Visitor hits a missing page / missing-game-99999999] /game/99999999: 4 runs, e.g. 11px "Home"; 11px "Standings"; 11px "Players"; 11px "Join" (shot 008-chromium-visitor-missing-game-99999999.png)
- **text under 12px** [chromium, Visitor hits a missing page / missing-nope] /nope: 4 runs, e.g. 11px "Home"; 11px "Standings"; 11px "Players"; 11px "Join" (shot 009-chromium-visitor-missing-nope.png)
- **text under 12px** [chromium, New player joins and finds their rating / join-email] /join: 8 runs, e.g. 11px "By joining you agree to the"; 11px "terms"; 11px "and"; 11px "privacy" (shot 010-chromium-new-player-join-email.png)
- **text under 12px** [chromium, New player joins and finds their rating / me-first-visit] /me: 4 runs, e.g. 11px "Home"; 11px "Standings"; 11px "Players"; 11px "Me" (shot 013-chromium-new-player-me-first-visit.png)
- **text under 12px** [chromium, New player joins and finds their rating / players] /players: 6 runs, e.g. 11px "Season"; 11px "Season ratings come from the rink's seas"; 11px "Home"; 11px "Standings" (shot 014-chromium-new-player-players.png)
- **text under 12px** [chromium, New player joins and finds their rating / settings] /settings: 8 runs, e.g. 11px "Injured reserve and Away keep your roste"; 11px "Counts games on Late Ice since the day y"; 11px "Saved on this phone."; 11px "Terms" (shot 015-chromium-new-player-settings.png)
- **text under 12px** [chromium, Captain takes over a team and adds a player / manage] /team/12/manage: 12 runs, e.g. 11px "Skaters"; 11px "Goalies"; 11px "On IR or away"; 11px "Subs never count. A player on injured re" (shot 021-chromium-captain-manage.png)
- **text under 12px** [chromium, Captain sets a lineup / lineup] /team/12/lineup/1: 6 runs, e.g. 10px "LW"; 10px "RW"; 11px "Home"; 11px "Standings" (shot 030-chromium-captain-lineup.png)
- **text under 12px** [chromium, Scorekeeper opens the scanner / scan] /scan: 7 runs, e.g. 11px "Photo of the sheet"; 11px "Glance, fix a typo"; 11px "Ratings update"; 11px "Home" (shot 034-chromium-captain-scan.png)

## Minor (4)

- **heading structure** [chromium, Visitor hits a missing page / missing-nope] /nope: 0 top headings [] (shot 009-chromium-visitor-missing-nope.png)
- **heading structure** [chromium, Signal drops mid-use / offline-standings] /: 0 top headings [] (shot 040-chromium-conditions-offline-standings.png)
- **heading structure** [webkit, Visitor browses standings, a team, a player and a game / game-shared-link] /game/1: 0 top headings [] (shot 051-webkit-visitor-game-shared-link.png)
- **passkey offer missing** [chromium, New player joins and finds their rating / me-first-visit] After the email code, the Face ID offer did not appear (browser may not support passkeys) (shot 013-chromium-new-player-me-first-visit.png)
