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

## 10. Subs, call-ups, injured reserve and "can't make it"

The scoresheet proves who actually played. That makes availability the one stat the app can verify every single game, and it is the stat captains care about most when drafting.

### Call-ups

A sub appearance is a **call-up**. Framing it that way turns a chore into a stat line.

- **Requested call-up.** The team is short (the app knows the roster and who's marked Out). The captain opens the pool, filtered to position, eligible level and players marked Available, sorted by rating. Pick one, they get the invite, they accept. When the sheet is scanned the call-up is confirmed by their name on it.
- **Walk-on call-up.** A name on the sheet that isn't on the roster and wasn't requested is still a call-up, recorded after the fact. The captain can match it to a registered player or promote it to the roster.
- **Goalie call-ups** are their own category. Every rink has an emergency goalie list in someone's phone; this is that list, with a record attached.
- **Stats:** call-ups received, call-up record (team W-L-T with you in the lineup), call-up points, teams played for. Team side: call-ups used, games played short.
- **Rating:** a called-up player is rated on the game like anyone else, and their rating counts toward the team's strength for that game only. Playing up a level and winning moves you more; playing down and winning moves you less, which is the expected-result math doing its job.
- **Level guard.** Leagues usually limit subs to one level up or down and ban them in playoffs. Each league gets a sub rule (default: one level either way, none in playoffs). A call-up that breaks the rule is flagged on the game for the captain and rink admin. The app doesn't block it, since the rink makes the call, but it shows it.

### Injured reserve

A player sets a status: **Available**, **IR** (injured, optional return date), **Away** (travel, work stretch), **Resting** (taking the season off).

- IR shows on the roster card and in the captain's lineup count, so the captain knows to call someone up before Sunday.
- IR **freezes** the rating: no moves, no provisional clock, no decay. Coming back is not a penalty.
- IR **pauses** the Iron Man streak instead of breaking it. Away and Resting also pause it. A no-show breaks it. This rewards telling the team the truth over going quiet.
- **Stats:** IR stints, days on IR, games missed to injury, longest healthy run. Returning from IR and getting a point earns the Comeback badge.
- The player controls their own status. Captains can see it, not set it.

### "Can't make it"

Per-game availability: **In**, **Out**, **Maybe**, with an optional one-tap reason for Out (Injured, Work, Family, Travel, Resting, Other).

- **Before there's a schedule,** the app infers the league night from sheet dates ("You play Sundays. Next Sunday, in or out?"). Once the schedule exists, the question gets a time attached.
- **The sheet settles it.** Every RSVP is checked against the sheet after the game:

| Said | Sheet | Recorded as |
| --- | --- | --- |
| In | On it | Played |
| In | Not on it | No-show |
| Out, 24h+ ahead | Not on it | Out (reason kept) |
| Out, under 24h | Not on it | Late scratch |
| Nothing | On it | Played (and a nudge to RSVP next time) |
| Nothing | Not on it | Ghost |

- **Stats:** attendance rate (games played / team games while on roster), RSVP accuracy (said In and showed), no-shows, late scratches, ghosts, Iron Man streak. Aggregate reasons make good rink-level content ("Work beat Family 3-1 in Wilmington this month").
- **Attendance stays out of the Late Ice Rating.** LIR measures how you play. Mixing in attendance would punish injured players and make the number mean nothing. Reliability is its own stat, shown right next to the rating on the draft card, because a captain choosing between a 4.1 who shows up 95% and a 4.4 who shows up 60% wants both numbers.
- **Who sees what.** Games played and the Iron Man streak are public. Attendance rate, no-shows, late scratches and reasons are visible to the player and to their captains, and in the draft pool to captains at the rink. Nobody gets publicly shamed for missing a Tuesday.

### What the captain sees Sunday morning

"Flyers vs Owls, 8:45. 9 skaters In, 1 Maybe, 2 Out (Reyes: work, Hales: IR). Your goalie is In. Call up a defenseman?" One tap opens the pool.

## 11. What changes in the data model

| Add | Why |
| --- | --- |
| `users` (phone, name, number, position, home_rink) | Registration; the draft pool is every registered user at a rink |
| `roster_slots` (team, number, display_name, user_id nullable) | Sheet-created slots hold stats; matching sets user_id |
| `roster_actions` (draft, match, claim, promote, with who/when) | Captain control and an audit trail |
| `team_roles` (captain, scorekeeper, rink_admin) | Who can do what |
| `appearances` separate from roster slots | Subs vs. members |
| `call_ups` (team, player, game, requested_by, status, level_flag) | Requested and walk-on call-ups, level guard |
| `player_status` (available / ir / away / resting, since, expected_return) | Injured reserve and status history |
| `availability` (player, team, game or inferred date, status, reason, set_at) | RSVPs and late-scratch timing |
| `attendance` (derived per game: played / no-show / out / late scratch / ghost) | RSVP checked against the sheet |
| `league_rules` (sub levels allowed, subs in playoffs) | Level guard per league |
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
