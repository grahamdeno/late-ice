# Late Ice: Roles and Permissions

Status: design, Nov 2026. Build follows this document; where code and this document disagree, fix one of them on purpose.

## 1. Principles

1. **Two kinds of authority, kept apart.** Hockey authority (who is on a team, what the score was) belongs to captains and rink staff. Account help (getting someone signed in, fixing a duplicate) belongs to support. Support never decides a hockey question, and rink staff never touch someone's account.
2. **Permissions are checked in one place.** Every route asks one function, `can(user, action, scope)`. No route checks a role name directly. The table in section 3 is the source of truth; the code mirrors it and the tests are generated from it.
3. **Every grant has a granter.** No role is self-assigned except the first captain of a team, and that is logged like any other grant.
4. **Nothing is deleted.** Revoking a role marks it ended, with who and when. The history answers "who was captain in October" and "who changed this."
5. **Smallest scope wins.** A role covers one team, one league, one rink, or the whole system. A rink manager at Polar Ice has no power at any other rink.

## 2. Roles

| Role | Scope | Granted by | Limit | In one line |
|---|---|---|---|---|
| Player | self | registering | | Their own profile, claims, availability, shot plots |
| Assistant captain | team | the captain | 2 per team | Runs the roster and schedule alongside the captain |
| Captain | team | first registered roster member, or rink staff | 1 per team | Owns the team: roster, assistants, schedule, disputes |
| Scorekeeper | rink | rink manager | any | Uploads sheets that count as official |
| League commissioner | league | rink manager | any | Settles disputes and fixes games in one league |
| Rink manager | rink | admin, after verification | any | Runs a rink: leagues, seasons, staff, rink-wide schedule |
| Support | system | admin | any | Helps people who are stuck. Reads everything, changes accounts, never hockey data |
| Admin | system | admin | any | Everything, including roles above and the rating job |

A person can hold several roles at once: captain of a C team, assistant on a 40+ team, and scorekeeper at the rink.

Roles considered and left out for now:
- **Referee.** Refs sign the sheet but don't need the app to do it. Revisit with live scoring.
- **Team manager (non-playing).** Real on some teams, but an assistant captain slot covers it, since assistants don't have to dress.
- **Sponsor or league partner.** No product yet. Add a scope when there is one.

## 3. Permission matrix

Legend: **✓** allowed. **own** only for themselves or their own team. Blank: not allowed.
Rink staff powers apply only inside their scope (their league or their rink).

| Action | Player | Asst | Capt | Scorekeeper | Commish | Rink mgr | Support | Admin |
|---|---|---|---|---|---|---|---|---|
| **Self** | | | | | | | | |
| Edit own profile, availability, hide own name | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Claim an unlinked roster spot | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Roster** | | | | | | | | |
| Draft, match, release a claim, merge spots | | own | own | | ✓ | ✓ | | ✓ |
| Merge two roster spots that are the same person | | | own | | ✓ | ✓ | | ✓ |
| Remove a player from the roster | | own (players only) | own | | ✓ | ✓ | | ✓ |
| Name or remove assistant captains | | | own | | ✓ | ✓ | | ✓ |
| Hand off captaincy, step down | | | own | | | | | |
| Reassign captain (contest outcome) | | | | | ✓ | ✓ | | ✓ |
| Rename team, change colors | | | own | | ✓ | ✓ | | ✓ |
| **Schedule and game night** | | | | | | | | |
| Connect a team calendar feed | | own | own | | | | | ✓ |
| Add or edit a manual game (tournament, exhibition) | | own | own | | ✓ | ✓ | | ✓ |
| Connect a rink-wide calendar feed | | | | | | | | |
| Set lines | | own | own | | ✓ | ✓ | | ✓ |
| See team RSVPs | own team | own team | own team | | ✓ | ✓ | | ✓ |
| Answer In / Late / Out for a game | own | own | own | | | | | |
| **Rinks, leagues and teams** | | | | | | | | |
| Ask to add a missing rink, or to start a team | ✓ signed in | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Add a rink, approve a new rink or its first manager | | | | | | | | ✓ |
| Edit the rink profile, add leagues and seasons | | | | | | ✓ | | ✓ |
| Rename a league | | | | | ✓ | ✓ | | ✓ |
| Add a team, approve a team request, remove an empty team | | | | | ✓ | ✓ | | ✓ |
| **Games and sheets** | | | | | | | | |
| Upload a scan | ✓ signed in | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ |
| Confirm a sheet | | own | own | ✓ | ✓ | ✓ | | ✓ |
| Record who played an imported game | | own | own | | ✓ | ✓ | | ✓ |
| Dispute a game (within 72 hours) | own | own | own | | | | | |
| Resolve a dispute, lock a game | | | | | ✓ | ✓ | | ✓ |
| Correct a confirmed game | | | | | ✓ | ✓ | | ✓ |
| **Visibility** | | | | | | | | |
| See team shot maps | own team | own | own | | | | | |
| See attendance, no-shows, reasons | own team | own team | own team | | ✓ | ✓ | | ✓ |
| See the draft pool | | rink | rink | | | ✓ | | ✓ |
| **Rink** | | | | | | | | |
| Edit rink profile, seasons, leagues | | | | | | ✓ | | ✓ |
| Grant scorekeepers and commissioners | | | | | | ✓ | | ✓ |
| Approve or remove a waitlisted signup | | | | | | ✓ | | ✓ |
| **Help desk** | | | | | | | | |
| Look up any account (read only) | | | | | | | ✓ | ✓ |
| Release a stuck claim, hide or unhide a name on request | | | | | | | ✓ | ✓ |
| Show a hidden name again | own | own | own | | | | ✓ | ✓ |
| Merge two accounts for the same person | | | | | | | ✓ (24 h hold) | ✓ |
| Read the audit log | | | | | | own rink | ✓ | ✓ |
| **System** | | | | | | | | |
| Grant rink managers, support, admins | | | | | | | | ✓ |
| Run the rating recompute | | | | | | | | ✓ |

What the running app does, where a cell above is easy to misread:

- **Upload a scan** is any approved signed-in user. **Confirm a sheet** is `sheet.confirm`: assistant or captain of one of the teams, or a scorekeeper, commissioner, rink manager or admin. A scorekeeper's confirm is not marked official, and nothing skips a duplicate wait.
- **Set lines** is `roster.manage`, so a commissioner, rink manager or admin can set them too. **See team RSVPs** and **attendance names** are every roster member, plus anyone with `schedule.manual` (assistant, captain, commissioner, rink manager, admin). A player sees the whole list, not only their own answer. Counts on the schedule are public. `team.private` (assistant, captain, rink manager, admin) is in the matrix and no route checks it.
- **See the team shot map** is anyone on that team. Players do not plot shots. The spots are samples from goals. Staff who are not on the team cannot open it.
- **Connect a rink-wide calendar feed** is not in the app. A rink manager is not on the team-feed grant (`schedule.feed` is assistant, captain, admin).
- **Show a hidden name again** is the player, an assistant or captain of one of their teams, support, or an admin (`name.unhide`). A commissioner or rink manager is not on that grant. Anyone can hide a name with no account. Support's hide, unhide and stuck-claim fix stay on `support.fix`.
- **Approve or remove a waitlisted signup** is `signup.approve`: the rink manager at that home rink, or an admin.
- **Record who played an imported game** is `lineup.record`: assistant or captain of that team, or a commissioner, rink manager or admin. DaySmart games carry a score but no lineup, so they rate players only once a lineup is recorded (Rink Desk, Games and lineups).
- **Rink Desk for captains:** a captain or assistant who isn't rink staff can open Rink Desk for their own team: Who's joined (sign-ups and the invite link, `roster.manage`) and Games and lineups (`lineup.record`), including who was in goal. Scoresheets, the rink-wide roster, ratings, imports and the Monday email stay with staff.
- Filing a dispute, locking a game and correcting a confirmed game are not separate routes. `game.resolve` (commissioner, rink manager, admin) is what staff use to discard a sheet and to open a league on the staff page.

Things nobody can do, on purpose:
- Edit a rating by hand. Ratings only come from games; fixing a game fixes the rating at the next nightly replay.
- See another team's shot maps. Not rink staff, not support, not admin through the app.
- Sign in as another user. Support gets a read-only "view as" page, never a session.
- Change the email on someone else's account. See section 5.

## 4. Rules for each role

### Captain
- **First captain:** the first registered player on the roster to tap "I'm the captain." Already built.
- **Contest:** a roster member who says they're the real captain files a contest. It goes to the league commissioner, then the rink manager, then support's queue if the rink has no staff yet. Support routes it to an admin; support does not decide it.
- **Hand off:** the captain picks any registered roster member. That person accepts, and the old captain becomes a regular player.
- **Vacancy:** if the captain leaves the roster, steps down, or is removed by rink staff, the longest-serving assistant becomes captain automatically and the team is notified. With no assistants, the role is open and any roster member can take it.
- One captain per team. A person can captain several teams.

### Assistant captain
- Named by the captain from registered roster members. Two at most.
- Can do the roster and schedule work a captain does, except: naming or removing assistants, handing off or stepping down as captain, removing the captain or another assistant from the roster, merging two spots that are the same person, and renaming the team.
- Loses the role automatically on leaving the roster.
- Shown as **A** on the roster, the captain as **C**, the way jerseys do it.

### Scorekeeper
- Granted by the rink manager at one rink.
- Confirming a sheet uses the same grant as a captain. The scan is not marked official, and there is no dispute window that a scorekeeper skips.
- Can't edit a game after confirming it. Corrections go to the commissioner.

### League commissioner
- Granted by the rink manager for one league. A rink can have one per league or one person for several.
- Reassigns captains and renames teams. Dispute, lock and correct are not separate routes yet. `game.resolve` lets them discard a sheet and open a league on the staff page.
- A correction, once it exists, re-rates by replaying every game.

### Rink manager
- Usually the hockey director. Granted by an admin only after a human check (a call to the rink's listed number). There is a "Run this rink? Request access" form that lands in the admin queue.
- Everything a commissioner can do, for every league at the rink, plus seasons, leagues, the rink profile, the rink-wide schedule feed, and granting scorekeepers and commissioners.
- A rink can have several managers (director plus front desk).

### Support
- Help desk. No code access needed.
- Can look up any account by email or name, see its roster spots, claims, roles and recent activity, and do these fixes: release a stuck claim, hide or unhide a name on request, merge duplicate accounts, resend nothing (codes come from Supabase; support tells the person to check spam and wait 60 seconds).
- Cannot change a score, a roster, a captain, a role, or a rating. Hockey questions go to rink staff; anything else goes to an admin.
- Every support action is logged and the affected user is told: "Support released your claim on #12, Hammer'd Heads."

### Admin
- Everything. Grants rink managers, support and other admins.
- **The first admin** is set by a server setting, `BOOTSTRAP_ADMIN_EMAIL`. When that address signs in and no admin exists yet, it becomes admin and the grant is logged. After that, admins are granted in the app, and the setting does nothing. This keeps any personal email out of the public code.

## 5. Account recovery (the risky part)

Changing which person controls an account is how accounts get stolen, so it has its own rules.
- **Nobody edits another user's email.** If someone loses access to their old address, they sign in with the new one, which creates a fresh account.
- **Support merges the two.** The person asks support; support checks with their captain that it's them; support starts the merge.
- **24-hour hold.** The old address is emailed: "Someone asked to move your Late Ice account to a new email. If this wasn't you, reply to stop it." After 24 hours with no objection, the merge runs: roster spots, claims, roles and history move to the new account.
- Admins can merge without the hold, logged.

## 6. Data model

One table replaces `team_roles`:

```
role_grants
  id
  user_id        -> users
  role           player | assistant_captain | captain | scorekeeper | commissioner | rink_manager | support | admin
  scope_type     team | league | rink | system
  scope_id       team, league or rink id; null for system
  granted_by     -> users (null only for the bootstrap admin and migrated captains)
  granted_at
  revoked_by     -> users
  revoked_at     null while active
  note           why, in a few words ("contest resolved", "left roster")
```

- Unique: one active captain per team; at most two active assistants per team (checked in code, inside a transaction).
- "Player" is not stored. Every registered user is a player.
- Migration copies each `team_roles` captain into `role_grants` with `granted_by` null and note "migrated", then drops `team_roles`.

Plus:
```
audit_log            staff and support actions: actor, action, target type and id, before and after (JSON), at
role_requests        rink manager access requests and captain contests: who, what, status, decided_by
account_merges       from_user, to_user, requested_by, notify_sent_at, run_after, status
```

Row level security stays as it is: on, with no policies. The browser key still reads nothing.

## 7. Enforcement

- `src/server/permissions.ts` holds the matrix as data: action name, roles allowed, and scope rule (own, team, league, rink, system).
- `can(user, action, scope)` resolves the user's active grants once per request, walks up the scope (team to league to rink to system), and returns yes or no. `require(user, action, scope)` throws a 403 with a plain message.
- Every route that changes data calls `require` before anything else. The existing `requireCaptain` checks become `require(user, "roster.draft", { teamId })` and so on.
- The smoke test walks the matrix: for each action, one user who should pass and one who should fail. A new action without a test fails CI.

## 8. What people see

- **Roster:** C and A next to names.
- **Team page, captain:** "Assistant captains" with Add and Remove. "Hand off captaincy."
- **Staff page** (`/staff`, only for rink staff, support and admin):
  - Rink manager: teams and captains, open disputes and contests, scorekeepers and commissioners, seasons, rink feed.
  - Support: search by email or name, account view, the three fixes, open merges.
  - Admin: rink access requests, grant and revoke staff, audit log, run recompute.
- **Profile:** a "Your roles" line, and a "Get help" link to support@tangomike.app with the app name and the person's account id filled in, so support can find them without asking.

## 9. Build order

1. `role_grants`, `audit_log`, `role_requests`, `account_merges` migration, with `team_roles` copied over.
2. `permissions.ts` and `can`/`require`; switch every existing route to it. No behavior change for captains.
3. Assistant captains: name, remove, C and A badges, vacancy promotion.
4. Captain hand-off and contest routing.
5. Bootstrap admin, `/staff` with admin and support views, audit log.
6. Rink manager request form, rink manager and commissioner views.
7. Account merge with the 24-hour hold.
8. Matrix tests in the smoke test.

Scorekeeper official scans and the dispute window ride along with the "scan attribution and disputes" item already in the build order.


## New rinks and their first manager

Any signed-in player can ask to add a rink that isn't listed. The request goes to system admins only. The card shows:

- A public map lookup (OpenStreetMap) for the name and city, with whether it's tagged as an ice rink.
- The rink's website.
- If the person also wants to manage it: their role at the rink, and two checks. Either check is enough.
  1. They signed in with an email on the rink's own web domain (free mail like Gmail never counts).
  2. An admin called the rink's public number (from its website or the map listing, never one the requester gave) and taps "Confirmed by phone".

Admins can approve the manager, approve the rink only, or decline. The server refuses a manager approval with neither check. A request to manage a rink that's already listed uses the same two checks.
