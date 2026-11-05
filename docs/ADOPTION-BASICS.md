# Late Ice — Adoption Basics

The questions a beer-league player, captain or rink manager asks in the first five minutes, and the answer the app gives. These decisions come before sign-in, notifications and hosting, because every one of those depends on them.

The organizing principle: **the scoresheet creates the record; people only ever claim what already exists.** Nobody registers a team, drafts a roster, types a schedule or enters a score. If the app ever asks someone to fill in a blank form, something went wrong.

---

## 1. How do I get on the app?

**You don't sign up to exist. You exist the first time a sheet with your name on it is scanned. Signing up just claims that record.**

Onboarding, in order:

1. Open the link a teammate texted you (it points at a game page, not a landing page).
2. See the game, the three stars, and your own name with a rating next to it.
3. Tap "That's me." Enter a phone number, get a six-digit code. No password, no email, no profile form.
4. Confirm your number and position. Done. Everything you've ever appeared on, at any rink, is now yours.

Why phone: beer league already runs on group texts. Phone is the identity people actually have for each other, it's how invites travel, and it's the hook for the notification that makes the app sticky ("your rating moved"). Apple and Google sign-in come with the iOS and Android apps.

What if nobody has scanned a sheet with your name yet? The app says so plainly: "Nothing with your name yet. Snap your next scoresheet and you're in." Then the camera button. There is no empty profile to build.

## 2. How do I get on my team's roster?

**The scoresheet is the roster.** If your name and number appear on a scanned sheet for a team, you are on that team. No invite, no captain approval, no draft.

Rules that make this work:

- **Appearance vs. roster member.** Every sheet creates an *appearance*. Three appearances for the same team in a season makes you a *roster member*. Fewer than three and you're listed as a sub. Subs still get rated.
- **Same person, different spellings.** Within a team, jersey number plus a similar name is the same person ("M. Tolliver", "Mike Tolliver", "Tolliver #1"). Across teams, a claimed player can say "that's me too" to merge an appearance. Unclaimed duplicates are merged by a captain or by anyone who claims both.
- **One player, one rating.** Playing C on Tuesday and Over 40 on Sunday is one profile with two teams and one rating. The level tag on each game tells the rating engine what it needs.
- **Captain is a light role, not a gate.** The captain is whoever claims it first for a team (teammates can contest). Captains can rename the team, merge duplicate players, mark a sub, and dispute a scan. They cannot add or remove games.

## 3. Which rinks show up, and why?

**Every indoor hockey rink in the country exists on day one. Only rinks with a scanned game are live.**

- **Seed the directory.** Load every US indoor rink as a place record (name, address, geo, sheets) from public directories, the same way a maps app knows about a restaurant before anyone reviews it. There are roughly 2,600 hockey rinks in the US, and several public lists cover most of the indoor ones.
- **Live vs. listed.** The switcher and region pages show live rinks (at least one confirmed game). Listed rinks are searchable and show "Be the first to scan a sheet here." That turns the empty map into an invitation instead of a dead end.
- **Rink detection from the sheet.** Most scoresheets have the rink or league name printed on them. The reader already extracts `rink_text`; match it to the directory and the scanner never picks a rink by hand. If it can't match, the app uses the phone's location to offer the nearest two or three rinks.
- **Missing rink.** "Add a rink" is a name plus an address, verified against the map. It's the one place the app accepts typed data, and it's needed once per rink, ever.
- **Regions are derived, not chosen.** A region is a metro area computed from rink locations (Wilmington, the Triangle, Charlotte). Players never pick a region; the app shows the one their live rinks fall into, and lets them browse others.

## 4. How does the app know the leagues, levels and seasons?

**From the sheet, with a rink admin able to correct it.**

- **League and level** come off the sheet ("League / Div: C"). Division variants (C1, C2) roll up to the level for rating and stay separate for standings.
- **Seasons** default to fixed windows (Fall: Sep–Dec, Winter: Jan–Mar, Spring: Apr–Jun, Summer: Jul–Aug). Standings reset per season; ratings never reset. A verified rink admin can set real season dates and playoff flags.
- **Nights** are inferred from game timestamps (the C league plays Sundays because that's when the sheets are dated).

## 5. Who scans, and why should anyone trust it?

**Anyone can scan. The system makes bad data hard to sneak in and easy to fix.**

- **Every scan is attributed** to a phone number once the scanner is signed in, and anonymous scans are allowed but marked as such until claimed.
- **First confirmed scan counts.** A second scan of the same game (same teams, same date) is compared field by field. If they agree, the game is marked "double-confirmed." If they disagree, both captains get a notice and the differences are shown side by side.
- **Dispute window.** Any roster member can dispute a game within 72 hours. Disputed games show a flag and are excluded from ratings until resolved by a captain of each team, or by the rink admin.
- **The photo is the evidence.** Every game links to its source sheet. Anyone can look.
- **Verified rink admin** (the hockey director) is the final word. They get a badge, can lock games, fix team names and set seasons. The app works without them, but recruiting them is the first thing to do at each rink.

## 6. How does the scoresheet get photographed at all?

This is the one question the app can't answer alone, and it decides whether the loop closes.

At most rinks the official sheet goes to the office after the game. Options, best first:

1. **Photo at the scorer's table** right after the handshake line, before the sheet leaves. Thirty seconds. This is the habit to build.
2. **Rink posts the sheets.** Some rinks tape them to a board or scan them to a league page. The app can read a photo of the posted sheet.
3. **Rink admin uploads.** If the hockey director is on board, the office can batch-upload the night's sheets in one go.

Open question for Wilmington: what does Polar Ice do with the sheet after the game, and will the scorekeeper let a captain photograph it at the table?

## 7. What's in it for me the first week?

Nobody downloads an app for a rating they don't have yet. The first-week payoff has to arrive from one scan:

- **The game recap card.** Score, three stars, scoring summary, shareable as an image to the team group text. This is the viral unit. It should look good enough to post.
- **Your number next to your name.** Even provisional, a rating is a hook. Showing the "why it moved" breakdown makes it feel earned instead of arbitrary.
- **Standings nobody else keeps.** Many rinks post standings late or not at all. Being the place that has them the same night is a reason to open the app Monday morning.

## 8. Whose names are these, and did they agree?

Scoresheets contain real names of people who never heard of the app. This has to be handled before anything is public.

- **Unclaimed players show first name and last initial** ("Mike T.") with their number. Full name appears when they claim the profile.
- **Anyone can hide themselves** with a text message to a published number, no account needed. Hidden players still count toward team results, but their line is shown as "Player #22."
- **No photos of faces, no addresses, no ages.** The sheet has none of that and the app shouldn't ask.
- **The rink gets a heads-up** before its name goes live, with the admin invite attached.

## 9. Where do upcoming games come from?

Not from the sheet, so this is the first thing that needs a different source.

- **Phase 1 (now):** no schedule. Results only. The app is a post-game tool.
- **Phase 2:** read the rink's posted schedule the same way we read sheets. Most rinks publish a PDF or a web table, and a vision model reads those too. A captain confirms once per season.
- **Phase 3:** the rink admin maintains it, or it syncs from whatever system the rink uses.

Game-night features (RSVP, lines, check-in) wait for Phase 2. Until then the app doesn't pretend to know when you play.

## 10. What changes in the data model

| Add | Why |
| --- | --- |
| `users` (phone, verified_at) and `claims` (user ↔ player) | Identity without profile forms |
| `appearances` separate from `roster_entries` | Subs vs. members, three-appearance rule |
| `player_aliases` | Spelling variants and merges |
| `rink_directory` (seeded, with `live_at`) | Every rink listed, live when scanned |
| `regions` computed from rink geo | No region picker |
| `seasons` per league with default windows | Standings reset, ratings don't |
| `scans` audit (who, when, device) and `disputes` | Trust without gatekeeping |
| `privacy` flags on players (hidden, display_name_mode) | Names of people who haven't opted in |
| `rink_admins` with verification | The hockey director as final word |

## Build order, revised

1. Phone sign-in and "That's me" claiming (uses the game-page link as the entry point)
2. Appearance/roster rules, aliases and merge
3. Name display rules and self-hide
4. Rink directory seed, live/listed states, rink detection from the sheet
5. Seasons and standings reset
6. Scan attribution, duplicate comparison, dispute flow
7. Shareable recap card
8. Rink admin role and the Polar Ice outreach
9. Push notifications ("your rating moved", "sheet needs a look")
10. Schedule reading, then game-night features
