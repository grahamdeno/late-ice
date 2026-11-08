# Late Ice UX audit

Engines: chromium, webkit. Phone 390x844 unless noted. 64 screens captured.

**Findings:** 0 blocker, 4 serious, 18 moderate, 5 minor

## Journeys

| Engine | Person | Job | Done | Taps | Time |
|---|---|---|---|---|---|
| chromium | visitor | Visitor browses standings, a team, a player and a game | yes | 4 | 9.3s |
| chromium | visitor | Visitor hits a missing page | yes | 0 | 5.1s |
| chromium | new-player | New player joins and finds their rating | yes | 6 | 8.3s |
| chromium | new-player | New player opens a game and the stars | yes | 1 | 2.4s |
| chromium | captain | Captain takes over a team and adds a player | yes | 10 | 9.4s |
| chromium | captain | Captain schedules next game and sets tonight's details | yes | 4 | 8.7s |
| chromium | captain | Captain fixes a missing goalie | yes | 1 | 3.3s |
| chromium | captain | Captain sets a lineup | yes | 4 | 5.1s |
| chromium | captain | Captain scouts tonight's opponent | yes | 1 | 2.2s |
| chromium | captain | Scorekeeper opens the scanner | yes | 1 | 1.1s |
| chromium | captain | Rink manager turns on three-stars voting | yes | 3 | 4.0s |
| chromium | conditions | Slow phone connection | yes | 0 | 6.6s |
| chromium | conditions | Signal drops mid-use | yes | 0 | 5.8s |
| chromium | conditions | Small phone, light mode, reduced motion | yes | 0 | 7.0s |
| webkit | visitor | Visitor browses standings, a team, a player and a game | yes | 4 | 9.8s |
| webkit | visitor | Visitor hits a missing page | yes | 0 | 5.4s |
| webkit | new-player | New player joins and finds their rating | yes | 6 | 9.1s |
| webkit | new-player | New player opens a game and the stars | yes | 1 | 2.8s |

## Serious (4)

- **a11y: document-title** [chromium, Signal drops mid-use / offline-standings] /: Documents must have <title> element to aid in navigation (1x) e.g. html (shot 042-chromium-conditions-offline-standings.png)
- **a11y: html-has-lang** [chromium, Signal drops mid-use / offline-standings] /: <html> element must have a lang attribute (1x) e.g. html (shot 042-chromium-conditions-offline-standings.png)
- **tap target under 24px** [chromium, Visitor browses standings, a team, a player and a game / career] /player/34/career: a "Thu, Aug 20" 72x16 (shot 005-chromium-visitor-career.png)
- **tap target under 24px** [chromium, Visitor browses standings, a team, a player and a game / career] /player/34/career: a "Thu, Sep 10" 70x16 (shot 005-chromium-visitor-career.png)

## Moderate (18)

- **console error** [chromium, Signal drops mid-use / offline-banner] Failed to fetch RSC payload for http://localhost:3097/leagues. Falling back to browser navigation. TypeError: Failed to fetch
    at y (http://localhost:3097/_next/static/chunks/1255-b84741b894bb9354.js:1:40385)
    at async _ (http://local (shot 041-chromium-conditions-offline-banner.png)
- **tap target under 40px** [chromium, Visitor browses standings, a team, a player and a game / home] /: a[nav-scan] "Scan scoresheet" 71x36 (shot 001-chromium-visitor-home.png)
- **tap target under 40px** [chromium, New player joins and finds their rating / join-profile] /join: input[input-age] "" 24x24 (shot 013-chromium-new-player-join-profile.png)
- **tap target under 40px** [chromium, New player joins and finds their rating / settings] /settings: input[input-pref-game-day] "" 24x24 (shot 016-chromium-new-player-settings.png)
- **tap target under 40px** [chromium, New player joins and finds their rating / settings] /settings: input[input-pref-result] "" 24x24 (shot 016-chromium-new-player-settings.png)
- **tap target under 40px** [chromium, New player joins and finds their rating / settings] /settings: input[input-pref-sub-request] "" 24x24 (shot 016-chromium-new-player-settings.png)
- **tap target under 40px** [chromium, New player joins and finds their rating / settings] /settings: input[input-pref-roster] "" 24x24 (shot 016-chromium-new-player-settings.png)
- **tap target under 40px** [chromium, New player joins and finds their rating / settings] /settings: input[input-pref-confirm] "" 24x24 (shot 016-chromium-new-player-settings.png)
- **tap target under 40px** [chromium, Captain takes over a team and adds a player / manage] /team/12/manage: a[link-back-team] "‹ Back" 36x44 (shot 023-chromium-captain-manage.png)
- **tap target under 40px** [chromium, Captain takes over a team and adds a player / manage-added] /team/12/manage: input[checkbox-spot-sub] "" 24x24 (shot 024-chromium-captain-manage-added.png)
- **tap target under 40px** [chromium, Rink manager turns on three-stars voting / desk-home] /desk: input[toggle-weekly-email] "" 24x24 (shot 037-chromium-captain-desk-home.png)
- **tap target under 40px** [chromium, Rink manager turns on three-stars voting / desk-season] /desk/season: input[toggle-star-voting-3] "" 24x24 (shot 038-chromium-captain-desk-season.png)
- **text under 12px** [chromium, Visitor browses standings, a team, a player and a game / player] /player/34: 1 runs, e.g. 10px "37" (shot 004-chromium-visitor-player.png)
- **text under 12px** [chromium, New player opens a game and the stars / game] /game/78: 2 runs, e.g. 10px "BL"; 10px "FI" (shot 017-chromium-new-player-game.png)
- **text under 12px** [chromium, Captain takes over a team and adds a player / me-captain] /me: 2 runs, e.g. 10px "87"; 10px "ST" (shot 022-chromium-captain-me-captain.png)
- **text under 12px** [chromium, Captain schedules next game and sets tonight's details / team] /team/12: 1 runs, e.g. 10px "ST" (shot 025-chromium-captain-team.png)
- **text under 12px** [chromium, Captain schedules next game and sets tonight's details / home-next-game] /: 5 runs, e.g. 10px "ST"; 10.08px "BL"; 10.08px "FI"; 10.08px "WD" (shot 028-chromium-captain-home-next-game.png)
- **text under 12px** [chromium, Captain sets a lineup / lineup] /team/12/lineup/7: 2 runs, e.g. 10px "LW"; 10px "RW" (shot 032-chromium-captain-lineup.png)

## Minor (5)

- **heading structure** [chromium, Visitor browses standings, a team, a player and a game / game-shared-link] /game/12: 0 top headings [] (shot 006-chromium-visitor-game-shared-link.png)
- **heading structure** [chromium, Visitor hits a missing page / missing-nope] /nope: 0 top headings [] (shot 010-chromium-visitor-missing-nope.png)
- **heading structure** [chromium, Signal drops mid-use / offline-standings] /: 0 top headings [] (shot 042-chromium-conditions-offline-standings.png)
- **native dialog** [chromium, Captain takes over a team and adds a player / me] Uses the browser's confirm box: "Claim Graham D. on Hammer'd Heads? Their captain sees it.". Feels like a web page, not an app. (shot 021-chromium-captain-me.png)
- **passkey offer missing** [chromium, New player joins and finds their rating / me-first-visit] After the email code, the Face ID offer did not appear (browser may not support passkeys) (shot 014-chromium-new-player-me-first-visit.png)
