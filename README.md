# Job Search Autopilot

Private, self-hosted job search pipeline: discover → score → prepare → approve → track.
Every application needs your approval in the admin UI, and every status change is logged.

Current milestone: **M1 — Foundation** (schema, RLS, owner-only admin login, empty overview).

## Local setup

Requires Node 24+, pnpm 10, and Docker Desktop (for local Supabase).

```bash
pnpm install
pnpm db:start                 # local Supabase in Docker
pnpm setup:local              # creates a test owner, writes .env.local (keys + owner login)
pnpm dev                      # http://localhost:3000/admin
```

The local owner's email and password are in `.env.local` (`LOCAL_OWNER_EMAIL`/`LOCAL_OWNER_PASSWORD`).
For a hosted project, create the owner in the dashboard, set `OWNER_USER_ID`, and run `pnpm owner:set`.

Public sign-ups are disabled; the owner account is created by an admin.

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
