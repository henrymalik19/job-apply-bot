# Job Search Autopilot

Private, self-hosted job search pipeline: discover → score → prepare → approve → track.
Every application needs your approval in the admin UI, and every status change is logged.

Current milestone: **M4 — Matching** (Claude scores each saved job against your profile and criteria).

## Local setup

Requires Node 24+, pnpm 10, and Docker Desktop (for local Supabase).

```bash
pnpm install
pnpm db:start                 # local Supabase in Docker
pnpm setup:local              # creates a test owner, writes .env.local (keys + owner login)
pnpm dev                      # http://localhost:3000/app (sign in at /login)
```

The local owner's email and password are in `.env.local` (`LOCAL_OWNER_EMAIL`/`LOCAL_OWNER_PASSWORD`).
For a hosted project, create the owner in the dashboard, set `OWNER_USER_ID`, and run `pnpm owner:set`.

Public sign-ups are disabled; the owner account is created by an admin.

## Code layout

```
app/                     UI only: pages, server actions, route handlers (Next.js)
server/
  modules/<domain>/      one folder per business domain (companies, criteria, jobs, discovery, runs, …)
    *.service.ts         the module's public API: use cases and business rules
    *.repository.ts      the only code that queries Supabase, one per table
    *.ts                 pure domain rules (no I/O), unit-tested
  integrations/          clients for external APIs (Greenhouse/Lever/Ashby today)
  auth/                  owner checks and sessions
  db/                    Supabase clients and generated types (pnpm db:types)
  core/                  shared errors
components/ui/           shadcn/ui components (Base UI + Tailwind); add more with `pnpm dlx shadcn@latest add <name>`
shared/                  pure helpers with no I/O (text, format, env)
workers/                 deployable entry points, one per Railway service
```

Rules: pages and actions call `ownerContext()` and then services, never Supabase. A module uses another
module only through its `*.service.ts`. Services take the database client as a parameter, so the same code
runs as the signed-in owner (RLS) in the web app and as the service role in workers.

## Workers

```bash
pnpm worker:pipeline          # discover, then per user match → prepare → notify (reads .env.local)
pnpm worker:discover          # discovery only
pnpm worker:match             # matching only
pnpm worker:prepare           # prepare only [--limit N]
pnpm worker:notify            # notification email only
pnpm import:profile           # one-time: facts, master resume and criteria from data/old
pnpm apply:filters            # re-apply discovery filters to saved jobs
```

Each worker takes whatever is waiting in the database, for every user, so running one twice is
harmless. In production each worker is its own Railway cron service, all built from `Dockerfile.worker`
(schedule in UTC, restart policy Never); their settings live on Railway, not in a repo file:

| Service | Cron | Start command | Variables |
|---|---|---|---|
| `discover` | `0 */6 * * *` | `pnpm worker:discover` | Supabase |
| `match` | `*/15 * * * *` | `pnpm worker:match` | Supabase, `ANTHROPIC_API_KEY` |
| `prepare` | `5-59/15 * * * *` | `pnpm worker:prepare` | Supabase, `ANTHROPIC_API_KEY` |
| `notify` | `10-59/15 * * * *` | `pnpm worker:notify` | Supabase, `RESEND_API_KEY` |

The values are Railway shared variables; each service references the ones it needs (`${{shared.NAME}}`).
Supabase means `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

When changing the discover cron, also set `settings.discover_interval_minutes` (default 240) so Health knows what
"late" means: it flags a source after two missed runs plus 30 minutes. Both services need `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`, plus `ANTHROPIC_API_KEY` for matching and prepare and `RESEND_API_KEY` for
notify (Railway blocks SMTP, so it sends through Resend; locally `JOB_INBOX_PASSWORD` over SMTP also works).
A stage whose variable is missing is skipped.
Railway logs are private; GitHub Actions only runs CI. Board failures are recorded per board and shown
on `/admin/health`; a board that fails twice in a row is retried at most every 2 hours.

## Checks

```bash
pnpm typecheck && pnpm lint && pnpm test   # unit
pnpm test:db                                # RLS + transition tests against local Supabase
```

## How access works

- **RLS on every table.** Policies allow only the user whose id is in the `owner` table
  (`is_owner()`). Anonymous users have no table grants at all.
- **Workers** use the service role key server-side; it bypasses RLS and is never sent to the browser.
- **Status changes** go only through `transition_application()` (wrapped by `lib/transition.ts`).
  Allowed moves live in the `status_transitions` table. A trigger rejects raw `UPDATE`s of
  `applications.status`, and each change writes an `events` row with its cause.
- **`public_status`** view exposes title, company, URL, status and dates only. It is not granted to
  `anon`/`authenticated`; the public page (M3) reads it server-side when `public_page_enabled` is true.

## Deploying (when ready)

1. Create a Supabase project, then `pnpm exec supabase link --project-ref <ref>` and
   `pnpm exec supabase db push`. In the dashboard, turn off email sign-ups.
2. Create the owner user, set env vars in Vercel (see `.env.example`), run `pnpm owner:set`
   against the hosted project.
3. Import the repo in Vercel; add the same secrets to GitHub Actions.
