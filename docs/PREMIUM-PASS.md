# Premium pass: work packages for agents

This is the build plan for the Late Ice premium pass. Each package below is one branch and one pull request. Read this whole file before starting any package. The reasoning behind every item is in the audit: https://claude.ai/artifact/BJYjxUwYUo7FAXhp4YVb2b (item numbers like 1.0 or 6.7 refer to its backlog).

## Crucial rules (read first, every time)

1. **Never push to `nextjs-supabase` or `master`. Never merge any pull request.** `nextjs-supabase` is production: Vercel deploys it to late-ice.tangomike.app. Graham and Claude merge. You stop at an open pull request.
2. **Never touch production.** Do not connect to the hosted Supabase database, do not change Vercel or Supabase settings, do not add or change environment variables or repository secrets. If a package needs a setting, a key or an account, list it in your report under "Graham needs to".
3. **Never commit a secret.** No API keys, private keys, tokens or passwords in code, tests, docs or commit messages.
4. **Push as few times as possible.** Vercel's free plan allows 100 deployments a day for the whole project and it ran out on November 5. Build and test locally first (`npm run build`, `npm run check`, the smoke test). Before you push again after a CI failure, read the failing job's log. **After three failed CI runs on one package, stop and report.** Do not keep retrying.
5. **Stay inside your package.** Only edit the files your package lists, plus new files it creates. If you must touch another file, say so in the report and keep the change minimal. Another agent may be working on the files you did not list.
6. **Shared files get small additions.** G1, G5 and G6 all add to the nightly job (`api/cron/recompute/route.ts`); G5 and G6 both touch `server/accounts.ts`. Add a call or a function; do not rearrange what is there, so the merges stay clean.
7. **Migrations are additive.** New files in `app/supabase/migrations/` use your package's number block so packages never collide: G1 `202611060001NN`, G4 `202611060004NN`, G5 `202611060005NN`, G6 `202611060006NN` (for example `20261106000101_g1_rink_timezone.sql`). Use `if not exists` everywhere. Add columns and tables only; never drop or rename.

## How to work a package

- Start from the latest `release/premium-pass`: `git fetch origin && git checkout -b grok/<package-id> origin/release/premium-pass`. Package ids are lower case: `grok/g1`, `grok/g2` and so on. Branches under `grok/` do not create Vercel deploys.
- Code lives in `app/`. Next.js 15 App Router, TypeScript, Tailwind, React Query, postgres.js on Supabase. Read `README.md`, `docs/ROLES.md` and the files your package names before changing anything.
- Conventions to keep:
  - All data access goes through `app/src/app/api/**` routes and `app/src/server/**`. The browser never queries Supabase directly. Every route uses `handle()` from `server/http.ts`.
  - Permissions only through `can()` / `require_()` in `server/permissions.ts`. Never check a role name in a route.
  - Every button, link and input a test might touch gets a `data-testid`.
  - Interface text: short, plain sentences, the way the existing screens talk. No exclamation marks, no emoji, no em dashes.
  - Write tests in `app/script/smoke.ts` (API, runs against a local Supabase in CI) for every behavior you add. Use `ok(cond, "plain sentence")` like the existing checks.
- Local run: see `README.md` (needs Docker for `npx supabase start`). If you cannot run Docker, say so in the report; CI runs the same steps.
- Open the pull request with **base `release/premium-pass`** (not `nextjs-supabase`). Title: `<package id>: <name>`. Body: the report below.

## Report (put this in the pull request body, and send it back to Graham)

1. Branch, last commit, PR link, CI result (pass or fail, with the failing step).
2. Each item in the package: done, partly done, or not done, with one line each.
3. Files changed outside the package's list, and why.
4. Migrations added.
5. Graham needs to: any setting, key, account or decision.
6. Anything you were unsure about.

---

## Order

| Wave | Packages | Starts when |
| --- | --- | --- |
| 1 | G1, G2, G4, G5, G6 (in parallel) | Now |
| 2 | C1 (Claude) | G1 merged into the release branch |
| 3 | G3 | C1 merged |
| Ship | One pull request `release/premium-pass` into `nextjs-supabase` | Graham says ship |

---

## G1. Server speed

The tab lag is the live API. `/api/rink` takes 3.6 to 3.8 s on every call and the Standings tab waits on six calls of 1 to 3 s, because routes run queries one after another and each is a round trip to Supabase. Target: every tab's data in one or two set-based queries.

Files: `app/src/app/api/rink/route.ts`, `app/src/app/api/leagues/[id]/route.ts`, new `app/src/app/api/standings/route.ts`, `app/src/server/services.ts` (only the `standings`, `leaders`, `gameCards` functions), `app/src/views/Leagues.tsx` (only `LeagueCard` and `Leagues`), `app/src/app/api/cron/recompute/route.ts`, `app/script/smoke.ts`, one migration.

1. **1.0** Rewrite `GET /api/rink` so the leagues list (with team count, game count and leader) comes from one query, and top players from one query. Same response shape.
2. **1.2** New `GET /api/standings?rink=<id>&season=<id optional>` returning every non-demo, non-tournament league at the rink with its standings rows, from at most two queries. Change `Leagues` / `LeagueCard` to use it (one request for the whole tab). Keep `/api/leagues/[id]` working for the league page.
3. **1.10** `/api/leagues/[id]`: return the latest 10 games (add `?games=all` for the full list) and batch whatever `gameCards` looks up per game into set queries.
4. **1.11** Add a query counter: wrap `q`/`one` in `server/db.ts` with a per-request counter that is only active when `process.env.LATEICE_COUNT_QUERIES === "1"`, exposed as a response header `x-query-count`. In `smoke.ts`, start the server with that variable and fail if `/api/rink`, `/api/standings`, `/api/feed`, `/api/bootstrap` or `/api/leagues/<id>` uses more than 10 queries. (Editing `server/db.ts` is allowed for this item.)
5. **8.4** Migration: `alter table rinks add column if not exists timezone text not null default 'America/New_York'`. In the nightly job, end IR and Away status using each user's home rink's time zone instead of the hardcoded `America/New_York`.
6. **1.9 (only if Graham gives the Supabase region in the prompt)** Set the matching Vercel function region in `app/vercel.json` (`"regions": ["<code>"]`). Otherwise list it under "Graham needs to".

Done when: CI passes, the new query-count checks pass, response shapes are unchanged except the documented `games` limit.

## G2. Tests and release safety

Files: new `app/vitest.config.ts`, new `app/test/**`, `app/package.json` (dev dependency and a `test` script), `.github/workflows/ci.yml` (add steps only), `.github/workflows/db-migrate.yml`, new `app/src/app/api/health/route.ts`.

1. **7.1** Add Vitest. Unit tests with fixtures, no database:
   - `server/ocr.ts` `checkSheet`: each warning fires on a crafted bad sheet, and a clean sheet gives none.
   - `server/permissions.ts`: the `MATRIX` grants each role exactly what `docs/ROLES.md` section 3 says (table-driven test).
   - `server/rating.ts`: extract the per-player math in `rateGame` into a pure exported function (same numbers, no behavior change) and test it: a win against a stronger team moves more than against a weaker one, provisional players move twice as fast, tournament games count half, the rating stays within 1 to 7. Moving the math into a function is the only change allowed in `rating.ts`.
   - About 30 tests. `npm test` runs them; CI runs `npm test` after the build.
2. Lint in CI as a non-blocking step (`continue-on-error: true`).
3. **7.2** In `db-migrate.yml`, before `db push`: dump the database with `pg_dump` (schema and data) using the same `SUPABASE_DB_URL`, gzip it, and upload it as a workflow artifact kept 30 days. If the dump fails, do not migrate.
4. **0.1 (code side)** `GET /api/health`: returns `{ ok: true, db: true }` after `SELECT 1`, `503` when the database does not answer. For an uptime monitor.

Done when: CI shows the new test step passing; `db-migrate.yml` is valid YAML and the dump step comes first.

## G3. Client speed and polish (wave 3, after C1)

Files: `app/src/lib/queryClient.ts`, `app/src/lib/auth.tsx` (`act()` and `useMe()` only), `app/src/app/providers.tsx`, `app/src/app/layout.tsx`, `app/src/app/globals.css`, `app/src/lib/ui.tsx` (`Loading` and new skeleton components), each tab view only to swap the loading state for its skeleton.

1. **1.1** Query defaults: `staleTime` 5 minutes, `gcTime` 30 minutes, `placeholderData: keepPreviousData`; remove `cache: "no-store"` from the query function.
2. **1.5** `act(method, url, body, keys?)`: invalidate only the given query-key prefixes; with no keys, invalidate `/api/me` and the current tab's keys. Update the call sites to pass the right keys. `/api/me` refetch interval to 5 minutes.
3. **1.6** After boot, prefetch the data for Home, Standings, Players and Me in parallel (use the query keys the views use).
4. **1.7** Skeletons shaped like each tab's first screen instead of the pulsing dot.
5. **1.3** Load Satoshi and Big Shoulders Display through `next/font` (local files for Satoshi, Google for Big Shoulders), Latin subset, `display: swap`. Remove the two stylesheet links.
6. **1.4** Ice glass: blur 12px, no `saturate`.
7. **6.10** Contrast: `--mute` and `--dim` in both themes at 4.6:1 or better against `--ice` and `--ice-2`. Put the measured ratios in the report.
8. Accessibility: one `prefers-reduced-motion: reduce` block that turns off `rise`, `drop-in` and `pulse-dot`; a visible `:focus-visible` ring in the brand red; chips and small buttons at least 36px tall with 8px gaps.

Done when: CI passes and the UI walkthrough still passes.

## G4. Scan resilience

Files: `app/src/server/ocr.ts`, `app/src/server/sheets.ts`, `app/src/server/scanlimits.ts`, `app/src/views/Scan.tsx`, `app/src/views/Sheet.tsx`, `app/src/app/api/sheets/**`, new `app/script/ocr-eval.ts` (copy it from branch `audit/measure`), new loop-event logging (see 0.2), one migration.

1. **0.2** Migration: add `input_tokens int`, `output_tokens int` to `sheets`; store `msg.usage` from the model call. New table `app_events (id serial, user_id int, kind text, team_id int, game_id int, created_at timestamptz default now())` and a server helper `logEvent()`; log `scan`, `confirm`, `rsvp` and `app_open` (once per user per day, from `/api/me`). Note: the existing `events` table is tournaments; do not use it.
2. **0.3** Add `script/ocr-eval.ts` from `audit/measure`. Do not add it to CI.
3. **4.2** Model fallback: if the first model's JSON fails to parse, retry the same model once with a short "Return only the JSON object" follow-up. Only call the fallback model when the read succeeded but `confidence < 0.6` or `checkSheet` returns 3 or more warnings; keep whichever result has fewer warnings. Raise `max_tokens` to 8192.
4. **4.3** Keep the model list in the `LATE_ICE_OCR_MODELS` environment variable. Do not change the default; Claude decides after the eval.
5. **4.1** A sheet in `failed` status, or one the reader says is not a scoresheet, shows three actions: **Retry with a new photo** (back to Scan), **Enter the score by hand** (a form for both team names, final score and who dressed by number; it creates the sheet's review data so the normal confirm path runs), **Send to the captain** (uses the existing proposal path). No dead ends.
6. **4.4** In `Scan.tsx`: decode with `createImageBitmap(file, { imageOrientation: "from-image" })` so phone photos are upright; refuse images under 800px on the long side with a clear message.
7. **4.5** Site cap default 2,000 a month (`SCAN_MONTHLY_CAP`), notify admins once at 60 percent and again at 100. Show the player how many scans they have left today on the Scan screen once they have used 10.

Done when: CI passes; new smoke checks cover the fallback rule (with the model call stubbed when `LATEICE_FAKE_OCR=1` is set) and the hand-entry path.

## G5. Installable app and notifications

Files: `app/public/sw.js`; new `app/src/components/InstallCard.tsx`, `UpdateBanner.tsx` and `NotificationSettings.tsx`, mounted from `app/src/app/providers.tsx` with one line each (G3 also edits `providers.tsx`, so add nothing else there); new `app/src/server/push.ts`; new `app/src/app/api/push/**`; the nightly job and the `notify()` call sites, minimal additions only; one migration.

1. **5.1** Install card: on the second visit, when not installed (`display-mode: standalone` false), a dismissible card. iPhone: the two Share > Add to Home Screen steps. Android and desktop Chrome: a button that calls the saved `beforeinstallprompt`. Dismissed stays dismissed for 30 days.
2. **5.2** Update banner: when a new service worker takes control (`controllerchange`), show "Update ready" with a Reload button. Change `sw.js` so the new worker waits until the page asks it to activate (post a message), instead of `skipWaiting()` on install.
3. **5.4** Offline: the service worker keeps the last good response for `GET /api/bootstrap`, `/api/feed`, `/api/me` and `/api/standings` (stale-while-revalidate), and the app shows a small "Offline" chip when it is serving from cache. Never cache other `/api` routes or anything that is not a GET.
4. **5.3** Web push:
   - Migration: `push_subscriptions (id serial, user_id int references users(id) on delete cascade, endpoint text unique, p256dh text, auth text, created_at timestamptz default now())` and `notification_prefs (user_id int primary key references users(id) on delete cascade, game_day boolean default true, result boolean default true, sub_request boolean default true, roster boolean default true, confirm boolean default true)`.
   - `POST /api/push/subscribe`, `DELETE /api/push/subscribe`, `GET/PUT /api/push/prefs`.
   - `server/push.ts` using the `web-push` package with `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` from the environment; does nothing when they are missing.
   - Send on these five events only: game day morning (from the nightly job: each user with a game today; one message per user), a confirmed result that includes the user, a sub request to the user, a captain adding, claiming or removing the user, and a sheet waiting for a captain's confirmation. Hook into the places those already create in-app notifications (`notify()` in `server/accounts.ts`), mapped by `kind`; only edit those call sites to pass the kind if they do not already.
   - Quiet hours 10 pm to 8 am in the user's home rink's time zone (if G1's `rinks.timezone` exists use it, else `America/New_York`), except results.
   - `NotificationSettings` component: the five toggles and an Allow button; Claude places it on the Settings page in C1.
   - Generate a VAPID key pair locally (`npx web-push generate-vapid-keys`). Put only the **public** key in the report. Tell Graham to add both keys and `VAPID_SUBJECT=mailto:support@tangomike.app` in Vercel. Do not commit the private key.

Done when: CI passes; smoke checks cover subscribe, prefs and quiet hours with sending stubbed.

## G6. Trust, privacy and fairness

Files: `app/src/app/api/teams/[id]/schedule/[gid]/lineup/route.ts`, `app/src/views/Lineup.tsx`, `app/src/views/Join.tsx` (age checkbox only), `app/src/views/Legal.tsx`, new `app/src/app/terms/page.tsx`, `app/src/server/accounts.ts` (display-name masking and merge only), `app/src/app/api/teams/[id]/merge/route.ts`, `app/src/views/ManageTeam.tsx` (merge confirm only), new `app/src/app/api/me/delete/route.ts` and `app/src/app/api/me/export/route.ts`, `app/src/app/api/cron/recompute/route.ts` (photo cleanup call only), `app/src/server/http.ts` (rate limit), one migration.

1. **6.7** Lineup auto-fill: fill by position and RSVP (In first, then no answer), in roster order. Do not sort by rating.
2. **6.9** Lineup picture: leave out lines with nobody placed; default to 2 forward lines and 2 defense pairs (a captain can still fill a third).
3. **6.8** "Same person as" merge: the confirm names both players and how many games and points move; write an `audit_log` row with both ids and the moved counts; only the captain or staff can do it (not assistants).
4. **6.1** Terms page at `/terms`: who can use it (18 and older), what a scoresheet photo is used for and who sees it, how disputes and removal work, contact. Plain language, under 600 words. Link it from `/privacy` and from the Join screen. Add an "I'm 18 or older" checkbox to the Join profile step; the server refuses the profile without it. Claude reviews the wording.
5. **6.5** Players who have not claimed their spot show to signed-out viewers as first initial, last name initial and number ("J. M. #12"). Signed-in players at the same rink see the name as today. Check every route that returns a player name (`display_name` is set in `accounts.ts` `displayFor`).
6. **6.2** In the nightly job: delete the stored photo of every sheet confirmed more than 90 days ago (keep the extracted data); record `photo_deleted_at`.
7. **6.3 (API only)** `POST /api/me/delete`: anonymizes the player rows to "Player #<number>", removes the user row and the auth user, keeps game lines. `GET /api/me/export`: the user's profile, spots, game lines, ratings and notifications as JSON. Claude adds the buttons to Settings in C1.
8. **6.6** A simple per-user write limit in `handle()` for non-GET requests: 60 a minute per user (Postgres table or in-memory per instance, your choice; say which in the report). Returns 429 with a plain message.

Done when: CI passes; smoke checks cover each item.

## C1. Claude: navigation, first screens and the player card

Claude builds this one. It owns `components/Shell.tsx`, `views/Home.tsx`, `views/Leagues.tsx` (after G1), `views/Players.tsx`, `views/Me.tsx`, `views/ManageTeam.tsx` layout, a new Settings page, and the player card (items 2.1 to 2.10 and 3.1 to 3.4). Do not edit these files in any G package beyond what the package says.

## Not in this pass

Rating math changes (epic 9), public pages and payments (epic 10), multi-rink beyond the time zone, the native shell, and the weekly backup copy to a second provider. They wait for the gates in the audit's roadmap.
