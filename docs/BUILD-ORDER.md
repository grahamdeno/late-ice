# Late Ice — Build Order

Brand: **Faceoff Dot** (direction #9). Stack: Next.js PWA + Supabase, with a Python rating worker. iOS and Android come later via Capacitor.

## Phase 0: Foundation
1. App scaffold: Next.js PWA, Supabase project, CI, preview deploys
2. Auth: phone or email magic link
3. Design system in the Faceoff Dot brand, plus the app shell (top-bar pull-down switcher, bottom nav)

## Phase 1: The hockey map (everything else hangs off this)
4. **Regions**: metro areas, starting with Charlotte
5. **Rink profiles**: address, sheets, a geofence for check-in, and the leagues each rink hosts
6. **League profiles**: rink, night, skill levels, plus seasons and divisions
7. **Team profiles**: roster, jersey colors, captain, division and record
8. **Player profiles**: number, position, teams and history. Players can claim a profile created from a roster or scoresheet

## Phase 2: Games
9. **Games and schedule**: manual entry and CSV import, plus a page for each game
10. **Result entry**: the captain enters the score and the other captain confirms it
11. **Game sheet upload**: photo, then AI reads goals, assists and penalties, then the captain reviews it and players confirm their own lines
12. **Standings**: computed automatically from confirmed results

## Phase 3: The rating
13. **LIR engine**: team-based rating with an adjustment for opponent strength, provisional ratings for new players, reliability (showing up), and a rating history
14. **"Why it moved" breakdown** after every game
15. **Leaderboards**: by division, league, rink, region and position

## Phase 4: The game-night loop
16. RSVP and live roster counts
17. Push notifications (invite, reminders, final score, rating update)
18. Rink check-in and lines
19. Three-stars voting

## Phase 5: Engagement
20. Badges (Night Owl, Passport, Giant Killer, Iron Man, ...)
21. Shareable player and result cards
22. Sub finder (requests matched by rating, position and distance)
23. Pickup listings

## Phase 6: Operators
24. Rink and league admin portal (schedules, rosters, disputes)
25. Bulk import from legacy stat sites and spreadsheets

## Phase 7: Native apps
26. iOS (Capacitor wrap, native push)
27. Android
