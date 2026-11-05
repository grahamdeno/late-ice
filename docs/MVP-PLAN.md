# Late Ice: MVP Plan for a National Beer League Hockey Rating

**Late Ice Rating (LIR):** one rating for every adult rec hockey player in the U.S. Tagline: "Every game counts. Even the 11:15." It updates after every game and carries across rinks, leagues and cities.

---

## 1. Market check: what exists today

### The big opening: Pointstreak is gone

Pointstreak was the go-to stats and scoresheet platform for rec hockey. It was retired on **May 31, 2026** ([TeamLinkt](https://teamlinkt.com/blog/best-pointstreak-alternatives-in-2026)). The shutdown followed the June 2025 merger of PlayMetrics and Stack Sports, which left the combined company with more than ten overlapping products to consolidate ([TeamLinkt](https://teamlinkt.com/blog/best-pointstreak-alternatives-in-2026)).

- Hockey Line says there is "no export, no login, no data to retrieve," so rinks are rebuilding from scratch ([Hockey Line](https://www.hockeylineapp.com/migrate)).
- One r/DataHoarder user estimated that millions of game sheets, covering more than 20 years of data, were lost ([Reddit r/DataHoarder](https://www.reddit.com/r/DataHoarder/comments/1uey3m3/pointstreak/)).
- On r/hockeyplayers, players say "each rink is now developing their own solution" ([Reddit r/hockeyplayers](https://www.reddit.com/r/hockeyplayers/comments/1u7lfqt/what_is_your_rink_using_for_league_scheduling_and/)).

**Why it matters:** the U.S. beer league data layer has just broken apart, and rinks are picking new tools right now. That makes this the best time in years to get a new standard adopted.

### Competitive landscape

| Player | What it does | Cross-league rating? |
|---|---|---|
| BenchApp | Team logistics (RSVPs, lines, payments). Claims 60k+ teams and 1M+ athletes ([BenchApp](https://www.benchapp.com/)). League plan is $10/team/month ([BenchApp](https://www.benchapp.com/league-management)) | No. Stats stay within a team or league |
| Hockey Line | Rink-side league management pitched as the Pointstreak replacement. Runs several leagues from one rink dashboard ([Hockey Line](https://www.hockeylineapp.com/compare)) | No. Built around the rink |
| HockeyShift, SportNinja, League Builder, My League Hero | League admin, scoring and standings ([Reddit](https://www.reddit.com/r/hockeyplayers/comments/1u7lfqt/what_is_your_rink_using_for_league_scheduling_and/), [League Builder](https://www.league-builder.com/blog/looking-for-a-pointstreak-alternative-meet-league-builder)) | No |
| BarDown | Team app with stats, Stars of the Game voting, sub finder ([App Store](https://apps.apple.com/us/app/bardown-hockey-team-manager/id6760355510)) | No |
| HPT | Tracks your own sessions (wearable style). Leaderboards filtered by age, skill and location ([HPT](https://hpt.pro/community-leaderboards/)) | Partly. Based on self-tracked data, not verified game results |
| RinkLog | Personal career stats across leagues ([RinkLog](https://rinklog.com/beer-league-hockey-stats)) | No. Stats only |
| Hockey Finder | Runs its own leagues, with players placing themselves on Levels 1–5 ([Hockey Finder](https://www.hockeyfinder.com/blog/coed-vs-womens-only-hockey)) | Self-rated only |
| Unnamed Reddit project | An "Elite Prospects for past-their-prime players." Has gathered stats from about 408 leagues, with claimable profiles and plans to rank players across leagues ([Reddit](https://www.reddit.com/r/hockeyplayers/comments/1xe9mu8/favor_can_you_link_me_to_your_beer_league_stats/)) | Planned. This is the closest to the idea, so watch it or partner with it |

**The gap:** lots of tools run leagues or track stats. None of them produce a verified, opponent-adjusted rating that carries across leagues.

### The model to copy: DUPR (pickleball)

DUPR proved this works in rec sports. Its rating:
- Moves based on **performance against expectation**, not just wins and losses. You can lose and still go up if you beat the expected score ([DUPR](https://www.dupr.com/post/how-your-dupr-rating-is-calculated)).
- Counts **verified league and tournament matches** more than self-posted ones ([DUPR](https://www.dupr.com/how-it-works)).
- Weights **recent games** more heavily, and shows a **reliability score** from 1–100% next to the rating ([DUPR](https://www.dupr.com/how-it-works)).
- Builds **team ratings from individual ratings** in doubles ([DUPR](https://www.dupr.com/how-it-works)). This is the same problem a hockey roster creates, just at a bigger scale.

---

## 2. Rating design (v1)

**Scale:** 1.000–9.000. Rough meaning: 1–2 learn-to-play, 3–4 D/C league, 5–6 B/A league, 7+ former junior or college players.

**Per-game update:**
1. Team strength = the average rating of the skaters who dressed, with goalies weighted separately.
2. Expected goal differential = a function of the gap in team strength.
3. Actual goal differential minus expected = the surprise.
4. Each player's change = surprise × K, where K shrinks as the player's game count and reliability grow. A small individual bonus can come from on-ice +/- if the league tracks it.
5. Weights: verified scoresheet = 1.0, captain-confirmed by both teams = 0.7, self-reported = 0.3.

**Goalies** get their own rating, based on goals allowed against expected for the shooting team's strength.

**Cold start:** new players begin at the average for their division (D league = 3.0, C = 3.8, and so on) with low reliability. The rating finds its level within about 10 games.

**Cross-league calibration:** subs, tournaments and players in more than one league act as bridges between leagues. Even a few hundred of them are enough to make ratings comparable across a whole metro area.

---

## 3. MVP feature list

### Phase 0: Prove the rating (one metro, 3–4 rinks, about 8 weeks)
- [ ] Captain or scorekeeper score entry: final score plus who dressed, in under 60 seconds
- [ ] **Scoresheet photo to data**: AI reads a photo of the paper game sheet (goals, assists, PIMs, goalies)
- [ ] Player identity: phone or email, optional USA Hockey number, and a claim-your-profile flow
- [ ] Rating engine (Section 2) runs nightly, with a public rating on each profile
- [ ] Player profile page (see mockup)
- [ ] Rink leaderboards: by division, position and age group

**Success metrics:** at least 70% of games entered within 24 hours, at least 50% of rostered players claim a profile, and at least 30% weekly active players during the season.

### Phase 1: Make it sticky (that metro, full season)
- [ ] **Sub finder by rating**: "Need a 4.0–4.5 D-man, Tue 9:45 at Extreme Ice." Every sub game links two leagues in the rating network
- [ ] Rink vs. rink leaderboards (best C-league team in Charlotte vs. Raleigh)
- [ ] Badges: Rink Passport (5 rinks), Iron Man (no missed games), Hat Trick, Gordie Howe, Comeback (won after trailing by 3+)
- [ ] Shareable "rating went up" cards for group chats and Instagram
- [ ] Commissioner tools: **sandbagger alerts** that flag teams or players rated well above their division, plus suggested division placement for the next season

### Phase 2: Go national
- [ ] National ladders by region, tier, age group (18+, 35+, 50+) and position
- [ ] Weekly fantasy beer league: draft real players from your own rink
- [ ] Integrations or partnerships with league platforms (Hockey Line, SportNinja, League Builder, BenchApp) so games flow in without extra entry
- [ ] Tournament seeding service for adult tournaments
- [ ] Regional championships leading to a national "Beer League Cup," with brewery sponsors

---

## 4. Go-to-market

1. **Lead with the Pointstreak gap.** Offer rinks free scoresheet digitizing and public stats pages. They get their stats back, and you get the data.
2. **Launch in one metro** where rinks are close together and players sub across rinks often, so the rating network connects quickly.
3. **Recruit captains, not players.** One captain brings 15 players. Give captains free premium features.
4. **Seed with drama.** Publish a weekly "Top 10 in the metro" and "biggest upset" post. Local bragging rights drive sign-ups.

## 5. Business model
- Free for players. Premium ($3–5/month) adds full rating history, advanced splits and fantasy.
- Rinks and leagues pay for commissioner tools: placement, sandbagger alerts and tournament seeding.
- Sponsorships: breweries, gear brands, and local businesses sponsoring leaderboards.

## 6. Risks and answers
| Risk | Answer |
|---|---|
| Rinks won't share data | Offer something they need (stats pages after Pointstreak) and make data sharing opt-in per league |
| Garbage self-reported scores | Weight by verification level, and require both captains to confirm |
| Toxicity from public ratings | Players can hide their exact number and show a tier badge (Bronze, Silver, Gold) instead |
| Sandbaggers tank their own ratings on purpose | The rating can't drop much in games your team wins, and alerts flag suspicious patterns |
| Someone else does it first (see the Reddit project) | Move fast in one metro, or partner with them |

---

## 7. Tech stack

### Strategy: one web codebase, three surfaces

Build a **Next.js PWA** first. Then wrap that same codebase with **Capacitor** for the iOS app, and later the Android app. The PWA stays live the whole time and becomes the public web layer: shareable player profiles, leaderboards and rink pages.

```
             ┌──────────────── Next.js app (TypeScript, React) ────────────────┐
             │  Public pages (server-rendered for SEO)  │  Logged-in app screens │
             └───────────────┬───────────────────────────┬─────────────────────┘
                             │                           │
       Web / PWA (Vercel) ◄──┘        Capacitor shell ───┴──► iOS (App Store), then Android (Play)
                             │
                   ┌─────────▼──────────┐
                   │ Supabase (Postgres, │◄── Rating engine worker (Python)
                   │ Auth, Storage, RLS) │◄── Scoresheet AI pipeline (vision model)
                   └─────────────────────┘◄── Notification service (Web Push + APNs + FCM)
```

### Why Capacitor over React Native / Expo for v1
- **Fastest path from PWA to the App Store.** Capacitor packages your existing web build into a native iOS or Android project ([DEV Community](https://dev.to/batmanofweb/capacitor-vs-react-native-for-lovable-apps-20hf)). There's nothing to rewrite.
- **Public pages matter for growth.** Every shared profile link ("I just hit 4.5") should open as a fast, server-rendered page with a rich preview image. Next.js does this out of the box. React Native's web output is weaker for SEO pages.
- **Escape hatch.** Keep the backend API-first. If the app ever needs heavier native features (live game tracking, Apple Watch), you can rebuild just the mobile app in Expo or Swift without touching the backend.

### Why not stay PWA-only
- **Push on iPhone is the weak spot.** iOS only allows web push for PWAs that have been added to the Home Screen (iOS 16.4+), and the permission request has to come from a tap ([Apple Developer](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)). iOS has no install prompt, so users have to go through Share → Add to Home Screen by hand ([GitHub notes on iOS PWA limits](https://github.com/Mads-Ringsted/Boedekasse/issues/4)).
- **The sub finder depends on push** ("D-man needed tonight, 9:45"). That's the main reason to ship a native iOS app quickly.

### Getting past Apple review (Guideline 4.2)
Apple rejects apps that are "a website in a wrapper" ([Capgo](https://capgo.app/blog/how-to-pass-app-store-review-2026/)). Bundle the web build inside the app instead of loading a remote URL, and ship real native features:
- Native push (APNs) for sub requests, game reminders and "your rating moved" alerts
- Native camera for **scoresheet capture** (the core MVP feature, and a good native justification)
- Native share sheet for rating cards, plus haptics
- Offline cache of your schedule and profile
- **Sign in with Apple**, which is required if you offer Google sign-in ([GitHub Capacitor template](https://github.com/danyalsad/web2app-capacitor-template))

### Component choices

| Layer | Pick | Notes |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind | One UI for web and mobile. Use `next-pwa` / Serwist for the service worker |
| Native shell | Capacitor (current major version) | Plugins: Camera, Push Notifications, Share, Haptics, Preferences |
| Backend / DB | Supabase (Postgres + Auth + Storage + row-level security) | Good fit for a small team. Leaderboards start as Postgres materialized views |
| Rating engine | Python worker (FastAPI + a job queue, e.g. Supabase queues or Redis/RQ) | Runs on the "game finalized" event, with a full nightly recompute for consistency. Rating math lives in one versioned module |
| Scoresheet AI | Vision LLM with structured JSON output → confidence scores → human confirm screen | Store the original photo for audits and disputes |
| Notifications | One internal service that sends Web Push (VAPID), APNs and FCM | Or use OneSignal at first to save time |
| Share cards | Next.js OG image generation | Auto-generated "rating went up" and badge images |
| Payments | Stripe on web. On iOS, RevenueCat (IAP) plus a US link to web checkout | In the US, apps can currently link to web checkout with no Apple commission, but Apple is fighting this in court and has asked for a fee ([Fora Soft](https://www.forasoft.com/blog/article/how-to-avoid-apple-pay-commission-204), [9to5Mac](https://9to5mac.com/2026/11/02/scotus-sets-hearing-date-for-apples-appeal-in-epic-games-case/)). Build so a fee can be added later |
| Analytics / errors | PostHog + Sentry | Track the funnel: score entered → profile claimed → weekly return |
| Hosting | Vercel (web) + Supabase (data) + Fly.io or Railway (Python worker) | |
| CI/CD | GitHub Actions + Fastlane (or Codemagic) for store builds | |

### Core data model (v1)
`players` · `rinks` · `leagues` · `divisions` · `seasons` · `teams` · `roster_entries` · `games` · `game_participants` (who dressed, position) · `game_events` (goals, assists, PIMs) · `scoresheet_uploads` · `rating_history` (player, game, before, after, reliability, algorithm version) · `badges` · `sub_requests` · `push_subscriptions`

### Rollout timeline (rough)
| Weeks | Milestone |
|---|---|
| 1–8 | **PWA live in one metro**: score entry, scoresheet AI, profiles, rating, rink leaderboards |
| 6–10 | **iOS via Capacitor**: native push, camera, Sign in with Apple, share sheet. Submit to TestFlight, then the App Store |
| 10–12 | **Android via Capacitor**: mostly config, FCM push and Play Store listing |
| Ongoing | PWA stays the public web layer, and the home for users who never install |
