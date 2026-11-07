# Late Ice UX audit

Engines: chromium, webkit. Phone 390x844 unless noted. 63 screens captured.

**Findings:** 0 blocker, 2 serious, 42 moderate, 4 minor

## Journeys

| Engine | Person | Job | Done | Taps | Time |
|---|---|---|---|---|---|
| chromium | visitor | Visitor browses standings, a team, a player and a game | yes | 4 | 8.6s |
| chromium | visitor | Visitor hits a missing page | yes | 0 | 4.8s |
| chromium | new-player | New player joins and finds their rating | yes | 6 | 7.9s |
| chromium | new-player | New player opens a game and the stars | yes | 0 | 1.0s |
| chromium | captain | Captain takes over a team and adds a player | yes | 10 | 9.0s |
| chromium | captain | Captain schedules next game and sets tonight's details | yes | 4 | 7.7s |
| chromium | captain | Captain fixes a missing goalie | yes | 1 | 3.1s |
| chromium | captain | Captain sets a lineup | yes | 4 | 4.8s |
| chromium | captain | Captain scouts tonight's opponent | yes | 1 | 2.0s |
| chromium | captain | Scorekeeper opens the scanner | yes | 1 | 1.0s |
| chromium | captain | Rink manager turns on three-stars voting | yes | 3 | 3.8s |
| chromium | conditions | Slow phone connection | yes | 0 | 6.5s |
| chromium | conditions | Signal drops mid-use | yes | 0 | 5.7s |
| chromium | conditions | Small phone, light mode, reduced motion | yes | 0 | 6.5s |
| webkit | visitor | Visitor browses standings, a team, a player and a game | yes | 4 | 10.5s |
| webkit | visitor | Visitor hits a missing page | yes | 0 | 5.0s |
| webkit | new-player | New player joins and finds their rating | yes | 6 | 8.4s |
| webkit | new-player | New player opens a game and the stars | yes | 1 | 2.2s |

## Serious (2)

- **a11y: document-title** [chromium, Signal drops mid-use / offline-standings] /: Documents must have <title> element to aid in navigation (1x) e.g. html (shot 041-chromium-conditions-offline-standings.png)
- **a11y: html-has-lang** [chromium, Signal drops mid-use / offline-standings] /: <html> element must have a lang attribute (1x) e.g. html (shot 041-chromium-conditions-offline-standings.png)

## Moderate (42)

- **console error** [chromium, Signal drops mid-use / offline-banner] Failed to fetch RSC payload for http://localhost:3097/leagues. Falling back to browser navigation. TypeError: Failed to fetch
    at y (http://localhost:3097/_next/static/chunks/1255-b84741b894bb9354.js:1:40385)
    at async _ (http://local (shot 040-chromium-conditions-offline-banner.png)
- **no recent games** [chromium, New player opens a game and the stars / settings] Home shows no game to open (shot 016-chromium-new-player-settings.png)
- **tap target under 40px** [chromium, Visitor browses standings, a team, a player and a game / home] /: a[nav-scan] "Scan scoresheet" 71x36 (shot 001-chromium-visitor-home.png)
- **tap target under 40px** [chromium, New player joins and finds their rating / join-profile] /join: input[input-age] "" 24x24 (shot 013-chromium-new-player-join-profile.png)
- **tap target under 40px** [chromium, New player joins and finds their rating / settings] /settings: button[switch-lookingForTeam] "Looking for a team" 52x32 (shot 016-chromium-new-player-settings.png)
- **tap target under 40px** [chromium, New player joins and finds their rating / settings] /settings: button[switch-willSub] "Will sub" 52x32 (shot 016-chromium-new-player-settings.png)
- **tap target under 40px** [chromium, New player joins and finds their rating / settings] /settings: input[input-pref-game-day] "" 24x24 (shot 016-chromium-new-player-settings.png)
- **tap target under 40px** [chromium, New player joins and finds their rating / settings] /settings: input[input-pref-result] "" 24x24 (shot 016-chromium-new-player-settings.png)
- **tap target under 40px** [chromium, New player joins and finds their rating / settings] /settings: input[input-pref-sub-request] "" 24x24 (shot 016-chromium-new-player-settings.png)
- **tap target under 40px** [chromium, New player joins and finds their rating / settings] /settings: input[input-pref-roster] "" 24x24 (shot 016-chromium-new-player-settings.png)
- **tap target under 40px** [chromium, New player joins and finds their rating / settings] /settings: input[input-pref-confirm] "" 24x24 (shot 016-chromium-new-player-settings.png)
- **tap target under 40px** [chromium, New player joins and finds their rating / settings] /settings: button[switch-hidden] "Hide my name" 52x32 (shot 016-chromium-new-player-settings.png)
- **tap target under 40px** [chromium, New player joins and finds their rating / settings] /settings: button[switch-archetype-opt-out] "Hide my player type" 52x32 (shot 016-chromium-new-player-settings.png)
- **tap target under 40px** [chromium, Captain takes over a team and adds a player / manage] /team/12/manage: a[link-back-team] "‹ Back" 36x44 (shot 022-chromium-captain-manage.png)
- **tap target under 40px** [chromium, Captain takes over a team and adds a player / manage] /team/12/manage: button[button-slot-17] "–Adam Y.Forward · Not signed up yet3.80›" 334x36 (shot 022-chromium-captain-manage.png)
- **tap target under 40px** [chromium, Captain takes over a team and adds a player / manage] /team/12/manage: button[button-slot-5] "–Alex F.Forward · Not signed up yet3.80›" 334x36 (shot 022-chromium-captain-manage.png)
- **tap target under 40px** [chromium, Captain takes over a team and adds a player / manage] /team/12/manage: button[button-slot-13] "–Ben M.Forward · Not signed up yet3.80›" 334x36 (shot 022-chromium-captain-manage.png)
- **tap target under 40px** [chromium, Captain takes over a team and adds a player / manage] /team/12/manage: button[button-slot-8] "–Claude H.Forward · Not signed up yet3.8" 334x36 (shot 022-chromium-captain-manage.png)
- **tap target under 40px** [chromium, Captain takes over a team and adds a player / manage] /team/12/manage: button[button-slot-14] "–Dan M.Forward · Not signed up yet3.80›" 334x36 (shot 022-chromium-captain-manage.png)
- **tap target under 40px** [chromium, Captain takes over a team and adds a player / manage] /team/12/manage: button[button-slot-4] "–Graham DeNoyerCCenter · Registered3.80›" 334x37 (shot 022-chromium-captain-manage.png)
- **tap target under 40px** [chromium, Captain takes over a team and adds a player / manage] /team/12/manage: button[button-slot-1] "–Jared A.Forward · Not signed up yet3.80" 334x36 (shot 022-chromium-captain-manage.png)
- **tap target under 40px** [chromium, Captain takes over a team and adds a player / manage] /team/12/manage: button[button-slot-9] "–Joseph H.Forward · Not signed up yet3.8" 334x36 (shot 022-chromium-captain-manage.png)
- **tap target under 40px** [chromium, Captain takes over a team and adds a player / manage] /team/12/manage: button[button-slot-3] "–Joshua B.Forward · Not signed up yet3.8" 334x36 (shot 022-chromium-captain-manage.png)
- **tap target under 40px** [chromium, Captain takes over a team and adds a player / manage] /team/12/manage: button[button-slot-16] "–Kristian S.Forward · Not signed up yet3" 334x36 (shot 022-chromium-captain-manage.png)
- **tap target under 40px** [chromium, Captain takes over a team and adds a player / manage] /team/12/manage: button[button-slot-11] "–Matt M.Forward · Not signed up yet3.80›" 334x36 (shot 022-chromium-captain-manage.png)
- **tap target under 40px** [chromium, Captain takes over a team and adds a player / manage] /team/12/manage: button[button-slot-2] "–Nathan B.Forward · Not signed up yet3.8" 334x36 (shot 022-chromium-captain-manage.png)
- **tap target under 40px** [chromium, Captain takes over a team and adds a player / manage] /team/12/manage: button[button-slot-15] "–Rob N.Forward · Not signed up yet3.80›" 334x36 (shot 022-chromium-captain-manage.png)
- **tap target under 40px** [chromium, Captain takes over a team and adds a player / manage] /team/12/manage: button[button-slot-10] "–Seth L.Forward · Not signed up yet3.80›" 334x36 (shot 022-chromium-captain-manage.png)
- **tap target under 40px** [chromium, Captain takes over a team and adds a player / manage] /team/12/manage: button[button-slot-6] "–Steve G.Forward · Not signed up yet3.80" 334x36 (shot 022-chromium-captain-manage.png)
- **tap target under 40px** [chromium, Captain takes over a team and adds a player / manage] /team/12/manage: button[button-slot-12] "–Steven M.Forward · Not signed up yet3.8" 334x36 (shot 022-chromium-captain-manage.png)
- **tap target under 40px** [chromium, Captain takes over a team and adds a player / manage] /team/12/manage: button[button-slot-7] "–Tristan H.Forward · Not signed up yet3." 334x36 (shot 022-chromium-captain-manage.png)
- **tap target under 40px** [chromium, Captain takes over a team and adds a player / manage-added] /team/12/manage: button[button-slot-162] "–Pat N.Defense · Not signed up yet3.80›" 334x36 (shot 023-chromium-captain-manage-added.png)
- **tap target under 40px** [chromium, Captain takes over a team and adds a player / manage-added] /team/12/manage: input[checkbox-spot-sub] "" 24x24 (shot 023-chromium-captain-manage-added.png)
- **tap target under 40px** [chromium, Rink manager turns on three-stars voting / desk-home] /desk: input[toggle-weekly-email] "" 24x24 (shot 036-chromium-captain-desk-home.png)
- **tap target under 40px** [chromium, Rink manager turns on three-stars voting / desk-season] /desk/season: input[toggle-star-voting-3] "" 24x24 (shot 037-chromium-captain-desk-season.png)
- **text under 12px** [chromium, Visitor browses standings, a team, a player and a game / home] /: 5 runs, e.g. 10.08px "NS"; 10.08px "IP"; 10.08px "CK"; 10.08px "LB" (shot 001-chromium-visitor-home.png)
- **text under 12px** [chromium, Visitor browses standings, a team, a player and a game / standings] /leagues: 4 runs, e.g. 10px "HH"; 10px "IP"; 10px "NS"; 10px "RR" (shot 002-chromium-visitor-standings.png)
- **text under 12px** [chromium, Visitor browses standings, a team, a player and a game / player] /player/41: 2 runs, e.g. 10px "86"; 10px "HH" (shot 004-chromium-visitor-player.png)
- **text under 12px** [chromium, Visitor browses standings, a team, a player and a game / game-shared-link] /game/12: 2 runs, e.g. 10px "NS"; 10px "IP" (shot 006-chromium-visitor-game-shared-link.png)
- **text under 12px** [chromium, Captain takes over a team and adds a player / me-captain] /me: 1 runs, e.g. 10px "12" (shot 021-chromium-captain-me-captain.png)
- **text under 12px** [chromium, Captain schedules next game and sets tonight's details / game-added] /team/12: 1 runs, e.g. 10px "BC" (shot 026-chromium-captain-game-added.png)
- **text under 12px** [chromium, Captain sets a lineup / lineup] /team/12/lineup/1: 2 runs, e.g. 10px "LW"; 10px "RW" (shot 031-chromium-captain-lineup.png)

## Minor (4)

- **heading structure** [chromium, Visitor browses standings, a team, a player and a game / game-shared-link] /game/12: 0 top headings [] (shot 006-chromium-visitor-game-shared-link.png)
- **heading structure** [chromium, Visitor hits a missing page / missing-nope] /nope: 0 top headings [] (shot 010-chromium-visitor-missing-nope.png)
- **heading structure** [chromium, Signal drops mid-use / offline-standings] /: 0 top headings [] (shot 041-chromium-conditions-offline-standings.png)
- **passkey offer missing** [chromium, New player joins and finds their rating / me-first-visit] After the email code, the Face ID offer did not appear (browser may not support passkeys) (shot 014-chromium-new-player-me-first-visit.png)
