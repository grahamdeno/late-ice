# Fall Wrap release: Season Wrapped, Roll Call, Next Season Card

Approved by Graham on Nov 17, 2026. Playbook 1.0.0, Stage 3: scope frozen. New ideas go to the next release.
Target: live Nov 27, 2026, before the Fall season's last game on Nov 29.

## The flow

The last game is confirmed, and Season Wrapped opens. The player taps through the recap. The last card asks
"Back for Winter?". If the player answers I'm in, they see the next season card (first game, dues, where to
pay). The captain watches next season's roster fill, and rollover uses the roll call. Players share recap cards
to the group text, and teammates open the link and claim their spot.

## Product rules for this release

1. Late Ice never holds or moves money. It shows where the team already pays: the rink's own payment page
   (Polar Ice uses DaySmart) or the captain's Venmo, Cash App, PayPal or Zelle.
2. Everything in this release is free. It has no purchases, paywall or plan checks.
3. Signed-out viewers see a shared recap only through a signed share token, the same pattern as shared game
   links (`src/server/visibility.ts`). They never see any other real team or rink data.
4. No numbers are invented. A recap card appears only when it has real data.
5. Name privacy is unchanged. Unclaimed players show first name and last initial (`applyViewerNames`), and
   hidden names never appear on anyone else's card, share image or page.
6. Inclusive design: text grows without clipping, 44 pt targets, every swipe or tap zone also has a button and a
   VoiceOver action, AA contrast in light and dark, color is never the only signal, Reduce Motion is honored,
   recap cards never auto-advance, and no awards shame anyone.

## Epic A: Season Wrapped

### A1: Wrapped opens at the right time
As a player, I want my recap to show up when my season is over so that it feels like an event.
- Given my team's last scheduled regular-season game has a confirmed result, when I open the app, then Home
  shows a full-width "Your Fall 2026 is wrapped" card and I get one notification (signed-up players only).
- Given my team has no scheduled games, then Wrapped opens when the season's end date passes, or when the
  captain or rink staff taps "Wrap the season" (A5).
- Given a sheet is confirmed after Wrapped opened, then the numbers update and the recap shows "Updated"
  with the date.
- Wrapped stays on Home for 14 days, then lives on the Career page.

### A2: My recap, one card at a time
As a player, I want to tap through my season one card at a time so that each number gets its moment.

| # | Card | Shows | Appears when |
|---|---|---|---|
| 1 | Cover | Bobblehead, "Your Fall 2026", team and rink | Always |
| 2 | Showed up | Games played of team games; latest puck drop played ("11:15 pm on Oct 9"); games starting after 10 pm; "Subbed N times" if any | 1+ game |
| 3 | Scoring | Goals, assists, points, rank on team. Goalies: record, GAA, shutouts | 1+ game with stats |
| 4 | Best night | Biggest game by points (or biggest rating jump), opponent, date | 3+ games |
| 5 | Your rating | Start, finish, peak, tier change | 3+ rated games |
| 6 | The room | Archetype voted by teammates; three-star selections | A vote or star exists |
| 7 | Milestones | Badges and milestones earned this season | 1+ earned |
| 8 | Team | Record, league finish, team leader in each column | Always |
| 9 | Back for Winter? | Roll call (B1) | On a roster |

- Given fewer than 3 games, then I get the short version (cards 1, 2, 8, 9) with the line "A short season on
  paper. The full story starts in Winter."
- Given some games came from the rink's imported results, then card 3 says "Includes games from [rink]'s
  posted results."
- Given I'm on two teams, then each team gets its own recap; cards 2 and 5 cover my whole season.
- Navigation: tap right or swipe for next, tap left for back, plus visible Back and Next buttons. Each card is
  one VoiceOver element with Next and Back actions. On large text sizes a card scrolls.

### A3: Share my recap
As a player, I want to share a card or my whole recap so that my teammates see it.
- Given I tap Share on any card, then I get a 1080 x 1920 image (existing story size in `src/server/cards.ts`)
  and a signed link.
- Given someone opens the link signed out, then they see only that recap, with "Claim your spot" if their
  invite or name matches that team, and "Get Late Ice" otherwise.
- The share image has alt text with the numbers.

### A4: Team wrap for the captain
As a captain, I want one team recap I can post in the group text.
- Shows record, finish, points leader, goals leader, most three stars, iron man (most games), cooler MVP (most
  cooler duties), goalie numbers.
- Positive awards only. The captain can hide any award before sharing (stored in `season_wraps.hidden_awards`).

### A5: Wrap the season
As a captain or rink manager, I want a "Wrap the season" button so that Wrapped opens without a schedule.
- A captain wraps their own team; rink staff wrap every team in a league. The action is logged in the audit
  log. The recap stays, and later sheets still update it.

Out of scope: video export, music, league-wide award voting, paid extras.

## Epic B: Roll call ("Back for Winter?")

### B1: Answer from the recap
- Answers: I'm in, Maybe, Not this season. The player can change the answer until the captain locks the roll call.
- Given "Not this season", then the screen says "Thanks for the season" and offers a "Want to sub?" toggle that
  turns on Will sub.

### B2: Captain sees next season fill up
- Manage team shows In, Maybe, Out and No answer, with names.
- "Nudge" reminds only players with no answer, at most once every 48 hours. Text: "4 haven't answered. Nudge them?"
- The captain can lock the roll call; answers freeze.
- Rink managers see counts per team (in, maybe, out, unanswered, asked about next season), never names.

### B3: Rollover uses the roll call
- Given a team locked its roll call, then rollover (`src/server/rollover.ts`) keeps In players, keeps Maybe
  players flagged, and marks Not this season as departures. History is kept and nothing is deleted.
- Given a team never ran a roll call, then rollover behaves exactly as today.

## Epic C: Next season card (first game, dues, how to pay)

Context: dues and dates are rarely written down. Players don't call; they wait for the captain's text. At Polar
Ice, players or captains pay the rink through DaySmart.

### C1: Captain posts the card
- Fields: first game (from the schedule when known, else a date and time), dues per player or Not set yet,
  due date, and how to pay: Pay the rink (C4 link), Pay me (Venmo, Cash App, PayPal or Zelle handle), or I pay
  the rink for the team.
- Prefilled from last season's card. Only captain and assistants can post or change it. A change notifies
  players who said I'm in.

### C2: Player sees it right after "I'm in"
- Shows "Winter: first game Sun, Jan 4 at 9:45 pm. Dues $[amount] by [date]." and one button: "Pay at [rink]"
  (opens the rink link) or "Pay [captain]" (Venmo, Cash App, PayPal open with amount and the note
  "Late Ice [season] dues, [team]"; Zelle shows the handle with Copy).
- Also shown on Home and the team page until the first game.
- Not posted: "Your captain hasn't posted Winter details yet" plus an "Ask [captain]" button.

### C3: Ask without calling
- Ask sends the captain one notice: "5 players asked about Winter: first game and dues." No names.
- Once a week per player; the count resets when the card is posted.

### C4: The rink's payment link
- One field on the rink profile, "Where players pay" (https only), set by a rink manager or admin.
- No link: "Pay the rink" is hidden for that rink's captains.

### C5: Who's paid
- The player taps "I paid" ("Marked as paid. Your captain will confirm."). States: Owes, Says paid, Paid, Waived.
  Captain or assistant confirms with one tap.
- "Remind who owes" reaches only players in Owes, at most once every 72 hours.
- The captain can turn the ledger off; the card still works.

### C6 (requirement): Dues stay private
- Amounts and paid states are visible only to the captain, assistants and the player concerned: never rink staff,
  support, admins through the app, teammates, share cards or signed-out pages.
- Enforced by a CI guard with a self-test: public and teammate-facing API responses are scanned for dues fields,
  and a planted leak must fail the guard.
- Export my data includes the player's own rows. Delete account removes the name from the ledger.

Out of scope: collecting money, reading DaySmart payment status, refunds, rink fees, per-game spare fees.

## Data (new tables only; no existing rows change)

- `season_wraps`: team_id, season_id, opened_at, opened_by (null when automatic), hidden_awards
- `rollcall_answers`: team_id, season_id, player_id, answer, answered_at; `rollcall_locks`: team_id, season_id,
  locked_at, locked_by
- `next_season_cards`: team_id, season_label, first_game_at, dues_amount, currency, due_on, pay_mode,
  pay_handles, ledger_on, updated_by, updated_at
- `dues_entries`: card_id, player_id, amount_due, state, marked_by, marked_at
- `next_season_asks`: card team_id, season_label, player_id, asked_at
- `rinks.pay_url` (nullable text)
- New `app_events` kinds: wrapped_open, wrapped_share, rollcall_answer, dues_paid_tap

## Edge cases

Big text and small phone, light and dark, VoiceOver, Reduce Motion, no games (no Wrapped; roll call only on
Manage team), heavy data (40+ games, 3 teams), offline (recap cached; Share and answers queue), imported stats
(labeled), unclaimed teammates (initials; can't answer until claimed), hidden names, deleted accounts, and
signed-out links (that recap only).
