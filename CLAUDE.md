# Late Ice: rules for agents

Playbook: Graham's product playbook 1.0.0 (grahamdeno/playbook). If this file and the playbook disagree, follow
this file and tell Graham.

## What uploads or deploys (check before every merge, push or workflow run)

| Trigger | What it does | Go-ahead needed |
|---|---|---|
| Any push or merge to `nextjs-supabase` | Vercel production deploy of the live web app | Ship go |
| Push to `nextjs-supabase` or `master` touching `app/supabase/migrations/**` | `db-migrate.yml` runs migrations on the production database | Ship go; Opus reviews the migration first |
| Running `db-migrate.yml` by hand (workflow_dispatch) on any branch | Migrations from that branch on the production database | Graham's explicit go |
| Push to `nextjs-supabase` touching `.github/workflows/live-check.yml` | Loads the live site | Ship go (rides with the deploy) |
| Push to any branch not listed in `app/vercel.json` `git.deploymentEnabled` | Vercel preview deploy (not live) | None, but it uses deploy quota |
| `backup-weekly.yml` (scheduled), `ci.yml` (every branch push and PR) | Backups and tests only | None |

Branches named `claude/**`, `grok/**`, `audit/**`, `ci-shots` and `opus-reader` do not deploy.

## Working rules

- Work on a branch; never commit to `nextjs-supabase` directly.
- Current release: Fall Wrap. Scope is `docs/FALL-WRAP.md`. Integration branch: `claude/fall-wrap`. Feature PRs
  target `claude/fall-wrap`; only Graham's ship go merges it into `nextjs-supabase`.
- Never run `db-migrate.yml`, never push to `nextjs-supabase`, never change Vercel or Supabase settings.
- Data stays server-side: row level security is on with no policies; every route goes through `src/server` and
  checks `permissions.ts` (`require_`).
- Privacy promises are enforced by CI guards with a self-test.
- Plain professional language in all user-facing text. No em-dashes. No military metaphors.
- Log each merged handoff in `docs/sonnet-log.md` (create it if missing).
