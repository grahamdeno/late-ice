# Late Ice — Adoption Basics

The questions a beer-league player, captain or rink manager asks in the first five minutes, and the answer the app gives. These decisions come before sign-in, notifications and hosting, because every one of those depends on them.

The organizing principle: **register once, then your captain pulls you onto the team. The scoresheet creates the record either way.** Nobody types a schedule or enters a score. Registration is a phone number and four fields, and it is the only form in the app.

---

## 1. How do I get on the app?

**You register first. Registering makes you draftable.**

1. Open the app (from a teammate's text, a rink flyer, or the store).
2. Phone number, six-digit code. Then name, jersey number, position, home rink. That's the whole form.
3. You now have a registered profile and you're in the **draft pool** for your home rink: visible to captains there, with your number and position.
4. If a captain has already built a roster and there's a slot in your name (because your name was on a scanned sheet), the app shows it: "Front Street Flyers has a #9 Sam Okafor. Is that you?" Tap to claim your spot. Your captain is notified and can reject a wrong claim.
5. If no slot exists yet, you wait to be drafted. Captains at your rink see you in the pool.

Why phone: beer league runs on group texts, and it's the hook for "your rating moved." Apple and Google sign-in arrive with the native apps.

## 2. How do I get on my team's roster?

**The captain pulls you on. Three ways a roster slot gets filled:**

| Path | Who acts | What happens |
| --- | --- | --- |
| **Draft** | Captain | Captain opens the draft pool for the rink and pulls a registered player onto the team. The player gets a notification and can decline. |
| **Match** | Captain | A scanned sheet already created a slot ("M. Tolliver #1") holding stats. Captain matches a registered player to that slot. Stats and rating history transfer to the person. |
| **Claim** | Player | If the captain has built the roster and a slot carries the player's name, the player can claim it. Captain is notified and can undo. |

What never happens: a name on a sheet does not put a registered person on a roster by itself. The sheet creates a **slot**, not a membership.

Rules that make this hold together:

- **Slots hold the team's record whether or not anyone registers.** An unregistered slot shows an obfuscated name ("M. Tolliver #1"), keeps every goal, assist and penalty minute, and carries a rating. The team's standings and stats are complete even if half the roster never downloads the app.
- **Matching is the only way stats move onto a person.** Captain action or player claim with captain visibility. No automatic merge across teams; a player who plays C and 40+ gets matched on each team and the app links the two slots to one profile and one rating.
- **Subs.** A name that appears on a sheet but isn't on the captain's roster is a sub slot. It's rated and listed under "Subs" for that game, and the captain can promote it to the roster.
- **Captain.** The first registered player to claim a team becomes captain; teammates can contest, and a verified rink admin can reassign. Captains build the roster, draft, match, rename the team, pick colors, and dispute scans. Captains cannot add, edit or remove games.
- **Spelling variants** on the same team with the same number ("Tolliver", "M. Tolliver") collapse into one slot automatically. Different numbers stay separate until the captain merges them.

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

Scorekeepers at Polar Ice will let captains photograph the sheet right after the game. So the three supported paths are:

1. **Captain photographs it at the scorer's table.** The default. Thirty seconds, before the sheet goes to the office.
2. **Scorekeeper texts the photo.** The app gets an inbound SMS/MMS number. A photo texted from a registered scorekeeper's phone is scanned exactly like an in-app upload, and the game lands in that rink's review queue.
3. **Scorekeeper uploads directly.** A **scorekeeper role** at the rink, assigned by the rink admin or self-claimed and verified. Scorekeeper scans are marked as official and skip the duplicate-comparison wait.

Games scanned by a scorekeeper or confirmed by both captains are marked official. A single captain scan is provisional until the 72-hour dispute window passes.

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
| `users` (phone, name, number, position, home_rink) | Registration; the draft pool is every registered user at a rink |
| `roster_slots` (team, number, display_name, user_id nullable) | Sheet-created slots hold stats; matching sets user_id |
| `roster_actions` (draft, match, claim, promote, with who/when) | Captain control and an audit trail |
| `team_roles` (captain, scorekeeper, rink_admin) | Who can do what |
| `appearances` separate from roster slots | Subs vs. members |
| `player_aliases` | Spelling variants and merges |
| `rink_directory` (seeded, with `live_at`) | Every rink listed, live when scanned |
| `regions` computed from rink geo | No region picker |
| `seasons` per league with default windows | Standings reset, ratings don't |
| `scans` audit (who, when, device) and `disputes` | Trust without gatekeeping |
| `privacy` flags on players (hidden, display_name_mode) | Names of people who haven't opted in |
| `rink_admins` with verification | The hockey director as final word |

## Build order, revised

1. Registration (phone, name, number, position, home rink) and the draft pool
2. Captain claim, roster builder: draft, match a registered player to a sheet slot, player self-claim with captain notice
3. Obfuscated slot names, alias collapse, self-hide
4. Rink directory seed, live/listed states, rink detection from the sheet
5. Seasons and standings reset
6. Scan attribution, duplicate comparison, dispute flow
7. Shareable recap card
8. Rink admin and scorekeeper roles, inbound text-a-photo number, Polar Ice outreach
9. Push notifications ("your rating moved", "sheet needs a look")
10. Schedule reading, then game-night features
