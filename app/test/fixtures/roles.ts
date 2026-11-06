// docs/ROLES.md section 3, stored roles only.
// Player is not a stored role (section 6), so a player cell never appears here.
// "own", "rink", "official", "own team", "own rink" and the 24 hour hold are still grants.
// Scope is checked outside this list.

export const ROLES = ["assistant_captain", "captain", "scorekeeper", "commissioner", "rink_manager", "support", "admin"] as const;

export interface Section3Row {
  action: string;
  /** The section 3 row, or rows, this action covers. */
  row: string;
  roles: readonly string[];
}

/** Each entry is one MATRIX action and the section 3 role columns for that row. */
export const SECTION3: Section3Row[] = [
  {
    action: "roster.manage",
    row: "Draft, match, release a claim, merge spots; Remove a player from the roster",
    roles: ["assistant_captain", "captain", "commissioner", "rink_manager", "admin"],
  },
  {
    action: "roster.merge",
    row: "Merge two roster spots that are the same person",
    roles: ["captain", "commissioner", "rink_manager", "admin"],
  },
  {
    action: "team.assistants",
    row: "Name or remove assistant captains",
    roles: ["captain", "commissioner", "rink_manager", "admin"],
  },
  {
    action: "team.edit",
    row: "Rename team, change colors",
    roles: ["captain", "commissioner", "rink_manager", "admin"],
  },
  {
    action: "captain.reassign",
    row: "Reassign captain (contest outcome)",
    roles: ["commissioner", "rink_manager", "admin"],
  },
  {
    action: "schedule.feed",
    row: "Connect a team calendar feed",
    roles: ["assistant_captain", "captain", "admin"],
  },
  {
    action: "schedule.manual",
    row: "Add or edit a manual game (tournament, exhibition)",
    roles: ["assistant_captain", "captain", "commissioner", "rink_manager", "admin"],
  },
  {
    action: "game.resolve",
    row: "Resolve a dispute, lock a game; Correct a confirmed game (game.resolve; no separate route yet)",
    roles: ["commissioner", "rink_manager", "admin"],
  },
  {
    action: "sheet.confirm",
    row: "Confirm a sheet",
    roles: ["assistant_captain", "captain", "scorekeeper", "commissioner", "rink_manager", "admin"],
  },
  {
    action: "signup.approve",
    row: "Approve or remove a waitlisted signup",
    roles: ["rink_manager", "admin"],
  },
  {
    action: "team.private",
    row: "team.private grant, not checked by a route",
    roles: ["assistant_captain", "captain", "rink_manager", "admin"],
  },
  {
    action: "name.unhide",
    row: "Show a hidden name again",
    roles: ["assistant_captain", "captain", "support", "admin"],
  },
  {
    action: "pool.view",
    row: "See the draft pool",
    roles: ["assistant_captain", "captain", "rink_manager", "admin"],
  },
  {
    action: "rink.manage",
    row: "Edit the rink profile, add leagues and seasons; Edit rink profile, seasons, leagues",
    roles: ["rink_manager", "admin"],
  },
  {
    action: "league.create",
    row: "Edit the rink profile, add leagues and seasons; Edit rink profile, seasons, leagues",
    roles: ["rink_manager", "admin"],
  },
  {
    action: "season.manage",
    row: "Edit the rink profile, add leagues and seasons; Edit rink profile, seasons, leagues",
    roles: ["rink_manager", "admin"],
  },
  {
    action: "rink.create",
    row: "Add a rink, approve a new rink or its first manager",
    roles: ["admin"],
  },
  {
    action: "league.edit",
    row: "Rename a league",
    roles: ["commissioner", "rink_manager", "admin"],
  },
  {
    action: "team.create",
    row: "Add a team, approve a team request, remove an empty team",
    roles: ["commissioner", "rink_manager", "admin"],
  },
  {
    action: "team.remove",
    row: "Add a team, approve a team request, remove an empty team",
    roles: ["commissioner", "rink_manager", "admin"],
  },
  {
    action: "rink.staff",
    row: "Grant scorekeepers and commissioners",
    roles: ["rink_manager", "admin"],
  },
  {
    action: "support.view",
    row: "Look up any account (read only)",
    roles: ["support", "admin"],
  },
  {
    action: "support.fix",
    row: "Release a stuck claim, hide or unhide a name on request",
    roles: ["support", "admin"],
  },
  {
    action: "support.merge",
    row: "Merge two accounts for the same person",
    roles: ["support", "admin"],
  },
  {
    action: "audit.view",
    row: "Read the audit log",
    roles: ["rink_manager", "support", "admin"],
  },
  {
    action: "system.grant",
    row: "Grant rink managers, support, admins",
    roles: ["admin"],
  },
  {
    action: "ratings.recompute",
    row: "Run the rating recompute",
    roles: ["admin"],
  },
];
