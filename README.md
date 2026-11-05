# Late Ice

**Every game counts. Even the 11:15.**

Late Ice is a national rating and competition layer for adult rec ("beer league") hockey. Every game at every rink feeds one portable player rating, the **LIR (Late Ice Rating)**. That rating powers standings across rinks, leagues and cities, plus badges, sub matching and fairer divisions.

![Game night flow](docs/game-night-flow.png)

## Game night, start to finish

| Time | Step | What happens |
| --- | --- | --- |
| 6:02 PM | The invite | A push notification. RSVP from the lock screen in one tap. |
| 6:03 PM | Tonight at a glance | Matchup, jersey colors, who's in, and your player card with your tier. |
| Anytime | Pull down to switch | Drag the top bar down to expand the active league into a switcher with quick actions (scan sheet, find a sub, pickup). |
| 10:21 PM | Rink check-in | Location-aware check-in, locker room, jersey color and tonight's lines. |
| 11:52 PM | Confirm the final | The captain scans the scoresheet. Players confirm their line and vote three stars. |
| 11:53 PM | Your rating moves | The goal light goes on, your new LIR shows up with a breakdown of why it moved, and badges and standings update. |

## The app (Wilmington pilot)

`app/` is the working pilot for Polar Ice Wilmington. Snap a photo of the scoresheet and the app reads every goal, assist and penalty, then updates standings and each player's Late Ice Rating. There is no manual score entry.

```bash
cd app
npm ci
npm run dev            # http://localhost:5000, needs Anthropic API credentials in the environment
```

- Stack for the pilot: React + Vite + Tailwind PWA, Express API, SQLite, and a Claude vision model for scoresheet OCR.
- `app/server/ocr.ts` is the scoresheet reader and its self-checks. `app/server/services.ts` has team matching, game confirmation and the LIR engine.
- `app/samples/` has synthetic test scoresheets (`make_sheets.py`) with their ground truth (`truth.json`).
- Team names are placeholders until real sheets are scanned.

## What's here

| Path | What it is |
| --- | --- |
| `app/` | Wilmington pilot app: scoresheet OCR, standings, ratings |
| `mockup/index.html` | Interactive mockup of the game-night flow. It's a single file: open it in any browser. |
| `docs/game-night-flow.png` | Storyboard of the six steps |
| `docs/MVP-PLAN.md` | MVP plan: market context, competitors, rating design, phased features, go-to-market, business model, tech stack |
| `branding/BRANDING.md` | 10 brand directions with logo marks |
| `branding/logos/` | SVG logo marks |

## Planned stack

- **Client:** Next.js PWA first, then wrapped with Capacitor for iOS, then Android. One codebase, and the PWA keeps running the whole time.
- **Backend:** Supabase (Postgres, Auth, Realtime, Storage), with a Python worker for rating calculations.
- **AI:** vision-model scoresheet scanning to ingest games.
- **Notifications:** Web Push, then APNs and FCM.
- **Payments:** Stripe on the web, RevenueCat in the native apps.
- **Ops:** Vercel, GitHub Actions with Fastlane, PostHog and Sentry.
