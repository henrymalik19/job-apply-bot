# Job Search Autopilot — Build Plan

A self-hosted system that discovers jobs, scores them against my profile, prepares tailored
application packets, queues them for my approval, tracks submission evidence and outcomes from
email, and shows everything on a dashboard (private admin + optional public status page).

**Build this milestone by milestone. Each milestone ends with its acceptance checks passing.
Do not start the next milestone until the current one is deployed and verified.**

### Status

| Milestone | State |
|---|---|
| M1 Foundation | Built and verified locally (45 DB tests, owner login). **Not yet deployed** (needs hosted Supabase + Vercel). |
| M2–M7 | Not started |

### Revisions

- **2026-10-29** — Added the After MVP section: multiple users (invite-only, per-user forwarding inbox instead of
  IMAP passwords), pg_cron + `tasks` queue, and a browser extension that fills LinkedIn Easy Apply and ATS forms
  in my signed-in browser while I click Submit (replaces the old "Later" assisted-submission note).
- **2026-10-28** — Adopted from a review of another builder's setup: `lessons` table, `confirmed_facts`
  as the only source the fact guard accepts, submission snapshots with sha256 document hashes,
  per-platform supervised test phase, "Needs you" notifications, discovery every 30 minutes,
  rejection emails labeled and archived. Added principles 8–10 (respect employer AI restrictions,
  no CAPTCHA/honeypot evasion, no agent-created accounts or password vault).
- **2026-10-21** — M1 implementation notes: Next 16 uses `proxy.ts` (formerly middleware); RLS checks an
  `owner` table via `is_owner()` because policies can't read env vars; allowed status moves live in a
  `status_transitions` table and a trigger blocks raw `status` updates.

---

## 1. Principles (non-negotiable)

1. **Human approves every application.** Nothing is submitted without an explicit approval in the admin UI.
2. **Never fabricate.** Tailored materials may reorder, reword and emphasize facts from `confirmed_facts`
   and the master profile only. No invented skills, titles, dates, numbers or employers. Yes/no qualification
   questions are answered "yes" only when a confirmed fact supports it. Legal attestations are never auto-answered.
3. **No "applied" without evidence.** An application is `submitted` only with a recorded action, and
   `confirmed` only with a matched confirmation email or captured confirmation page.
4. **No scraping of LinkedIn/Indeed.** Use official public ATS job-board APIs plus job-alert emails.
5. **Everything is logged.** Every status change writes an `events` row with its cause. Every scheduled
   run writes a `runs` row with counts and errors.
6. **Idempotent workers.** Any worker can be re-run safely. Dedup is enforced by database constraints,
   not application logic alone.
7. **Secrets only in environment variables.** Never committed, never logged, never sent to the client.
8. **Respect the employer's rules about AI.** If a posting or question restricts AI use, that question goes
   to the Needs you lane and I write the answer. Instructions aimed at AI agents (including hidden text like
   "if you're an AI, say X") are flagged on the application for me to see — never obeyed, never stripped or hidden.
9. **No bot-detection evasion.** No CAPTCHA solvers, no honeypot-field evasion. A CAPTCHA means a human does
   that step: the application goes to Manual.
10. **The agent never creates accounts or holds passwords.** I create each ATS account (e.g. Workday, once per
    company) and keep passwords in my own password manager. The agent may fill forms while I'm signed in, and may
    read a verification code from the job inbox to confirm an application I approved.

---

## 2. Stack

| Layer | Choice |
|---|---|
| Database, auth, file storage | Supabase (Postgres, Supabase Auth, Supabase Storage) |
| Web app | Next.js (App Router, TypeScript), deployed on Vercel |
| UI | Tailwind + shadcn/ui; charts with Recharts |
| Background workers | TypeScript scripts in `/workers`, run on a schedule by GitHub Actions |
| LLM | Anthropic Claude API (`@anthropic-ai/sdk`). Scoring: `claude-haiku-5-5`. Tailoring/answers: `claude-sonnet-5-5` |
| Email tracking | See decision D3 (IMAP with app password recommended) |
| Notifications | See decision D6 |
| Resume PDF | HTML template rendered to PDF with Playwright in the worker |
| Migrations | Supabase CLI (`supabase/migrations/*.sql`) |
| Tests | Vitest (unit + DB integration against local Supabase), Playwright (e2e for the web app) |

Repo layout:

```
/app                 Next.js routes (public + admin)
/components
/lib                 db client, shared types, scoring, dedup, question classifier, fact guard
/workers             discover.ts, match.ts, prepare.ts, track-email.ts, expire.ts, notify.ts
/workers/sources     greenhouse.ts, lever.ts, ashby.ts, email-alerts.ts
/supabase/migrations
/templates/resume    HTML/CSS resume template
/profile             master-profile.example.json (real profile lives in DB, not repo)
/scripts             set-owner.ts, setup-local.ts
/tests/db            RLS and transition integration tests
/.github/workflows   scheduled worker runs + CI
```

---

## 3. Data model

The M1 migration (`supabase/migrations/20261021000000_init.sql`) creates the tables below. Tables and
columns marked *(Mx)* are added by a later migration in that milestone. All tables: `uuid` PKs
(`gen_random_uuid()`), `timestamptz`, `created_at default now()`, RLS forced on.

```sql
create table owner (               -- single row; is_owner() compares auth.uid() to it
  singleton boolean primary key default true check (singleton),
  user_id uuid not null,
  created_at timestamptz not null default now()
);

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ats text not null check (ats in ('greenhouse','lever','ashby','other')),
  board_token text,                 -- greenhouse board token / lever site / ashby org
  priority int not null default 0,  -- higher = more wanted
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (ats, board_token)
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  company_name text not null,
  source text not null,             -- greenhouse | lever | ashby | email_alert
  external_id text,
  url text not null,
  apply_url text,
  title text not null,
  location text,
  remote_type text,                 -- remote | hybrid | onsite | unknown
  salary_min int, salary_max int, salary_currency text,
  description_md text,
  posted_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  closed_at timestamptz,
  dedup_key text not null,          -- normalized company + normalized title + location
  raw jsonb,
  unique (source, external_id),
  unique (dedup_key)
);

create table criteria_versions (
  id uuid primary key default gen_random_uuid(),
  criteria jsonb not null,          -- roles, seniority, locations, salary floor, dealbreakers, threshold
  created_at timestamptz not null default now()
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  criteria_version_id uuid not null references criteria_versions(id),
  hard_filter_passed boolean not null,
  hard_filter_reason text,
  score int check (score between 0 and 100),
  reasons jsonb,                    -- {fits: [...], gaps: [...]}
  model text,
  created_at timestamptz not null default now(),
  unique (job_id, criteria_version_id)
);

create table resume_versions (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  content jsonb not null,           -- structured resume (JSON Resume–style)
  is_master boolean not null default false,   -- at most one master (partial unique index)
  created_at timestamptz not null default now()
);

create type app_status as enum (
  'queued','needs_input','manual','approved','submitted','confirmed',
  'responded','interviewing','offer','rejected','skipped','expired','failed'
);

create table applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references jobs(id),
  match_id uuid references matches(id),
  status app_status not null default 'queued',
  resume_pdf_path text,
  resume_content jsonb,
  cover_letter text,
  apply_method text,                -- self | assisted
  flags jsonb not null default '[]', -- (M5) e.g. {kind:'ai_restriction'|'ai_directed_text', excerpt, question_id}
  approved_at timestamptz,
  submitted_at timestamptz,
  confirmed_at timestamptz,
  last_status_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table answer_bank (
  id uuid primary key default gen_random_uuid(),
  canonical_question text not null unique,
  answer text not null,
  category text,                    -- authorization, salary, logistics, eeo, skills, links, other
  variants text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table application_questions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  question text not null,
  field_type text,                  -- text | textarea | select | multiselect | boolean | file
  options jsonb,
  required boolean not null default false,
  bucket text not null check (bucket in ('auto','drafted','needs_user','cannot_automate')),
  answer text,
  answer_bank_id uuid references answer_bank(id),
  user_approved boolean not null default false
);

create table evidence (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  kind text not null check (kind in (
    'screenshot','confirmation_page','confirmation_email','user_attested',
    'document','answers_snapshot'   -- (M6)
  )),
  storage_path text,
  sha256 text,                      -- (M6) hash of the exact file sent (documents, screenshots)
  payload jsonb,                    -- (M6) answers_snapshot: [{question, answer}] exactly as submitted
  text_excerpt text,
  email_message_id text,
  created_at timestamptz not null default now()
);

create table emails (
  id uuid primary key default gen_random_uuid(),
  message_id text not null unique,
  received_at timestamptz not null,
  from_addr text, subject text, snippet text,
  classification text,              -- confirmation | rejection | interview | recruiter | job_alert | other
  application_id uuid references applications(id),
  match_confidence real,
  archived_at timestamptz,          -- (M6) set when a rejection is labeled + archived in the inbox
  processed_at timestamptz not null default now()
);

create table events (
  id bigint generated always as identity primary key,
  application_id uuid references applications(id) on delete cascade,
  job_id uuid references jobs(id) on delete cascade,
  from_status app_status,
  to_status app_status,
  cause text not null,              -- '<actor>:<action>', e.g. 'user:approve', 'email:confirmation'
  detail jsonb,
  created_at timestamptz not null default now()
);

create table runs (
  id uuid primary key default gen_random_uuid(),
  worker text not null,             -- discover | match | prepare | track_email | expire | notify
  source text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  counts jsonb,
  error text
);

create table settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table status_transitions (  -- single source of truth for allowed status moves
  from_status app_status not null,
  to_status app_status not null,
  primary key (from_status, to_status)
);

-- (M4) Rules learned from my corrections, injected into every relevant LLM call.
create table lessons (
  id uuid primary key default gen_random_uuid(),
  rule text not null,               -- "Never use the word 'passionate'."
  scope text not null default 'global'
    check (scope in ('global','scoring','tailoring','answers','cover_letter','platform')),
  platform text,                    -- set when scope = 'platform' (e.g. 'workday')
  source text,                      -- where it came from: an edit diff, a skip reason, typed by me
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- (M4) Facts I have confirmed about myself. The ONLY source the fact guard accepts.
-- Covers things not on the resume (work authorization, notice period, side projects, tools used).
create table confirmed_facts (
  id uuid primary key default gen_random_uuid(),
  category text not null,           -- employment, education, skill, metric, authorization, logistics, link, other
  fact text not null,
  structured jsonb,                 -- optional machine-checkable form: {employer, title, start, end, number, ...}
  confirmed_at timestamptz not null default now(),
  active boolean not null default true
);

-- (Later) Per-platform playbooks with a supervised test phase for assisted submission.
create table platforms (
  platform text primary key,        -- greenhouse | lever | ashby | wellfound | workday
  mode text not null default 'supervised' check (mode in ('supervised','unattended','disabled')),
  consecutive_successes int not null default 0,
  required_streak int not null default 3,
  playbook_md text,                 -- platform-specific steps and gotchas (lessons with scope=platform also apply)
  updated_at timestamptz not null default now()
);
```

Also (implemented in M1):
- `transition_application(id, to, cause, detail)` is the **only** way status changes. It checks
  `status_transitions`, stamps `approved_at`/`submitted_at`/`confirmed_at`, and writes the `events` row in
  the same transaction. A trigger rejects raw `UPDATE`s of `applications.status`. `lib/transition.ts` wraps it.
- Application creation writes an `events` row (`system:create`).
- **Row Level Security on every table**, forced. Only the owner (`is_owner()`) can read/write; `anon` has no
  grants. Workers use the service role key server-side only.
- `public_status` **view** exposing only: job title, company name, job URL, status, and status dates. Not granted
  to `anon`/`authenticated`; the public page reads it server-side, only when `settings.public_page_enabled = true`.

---

## 4. Workers

All workers: TypeScript, run via `pnpm worker:<name>`, write a `runs` row at start and finish
(`ok`, `counts`, `error`), catch per-item errors so one bad job doesn't fail the run, retry network
calls with exponential backoff (3 attempts), respect a polite delay between requests to the same host.

Every LLM call includes the active `lessons` for its scope (plus `global`), and the fact guard checks against
`confirmed_facts` (plus the master resume, whose facts must also be in `confirmed_facts`).

### 4.1 discover (every 30 minutes)
Sources (verify endpoints against current public docs before implementing):
- Greenhouse: `https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true`
- Lever: `https://api.lever.co/v0/postings/{site}?mode=json`
- Ashby: `https://api.ashbyhq.com/posting-api/job-board/{org}?includeCompensation=true`
- Email alerts (LinkedIn/Indeed alert emails in the job inbox): parse job title, company, URL. Treat as
  `source='email_alert'`; do not visit LinkedIn/Indeed pages programmatically.

Behavior:
- Upsert by `(source, external_id)`; also check `dedup_key` to merge cross-source duplicates.
- Update `last_seen_at` for jobs still listed; set `closed_at` for jobs from that board no longer listed.
- Pre-filter cheaply before inserting (title keywords / obvious non-matches) to keep the table lean, but
  keep a count of filtered-out items in `runs.counts`.
- At a 30-minute cadence, keep requests cheap: one request per board per run, polite per-host delay,
  and skip a board for the run if it failed in the last 2 runs (back off; Health shows it).

### 4.2 match (after discover)
- For each open job without a match for the current `criteria_version`:
  1. **Hard filters** in code (no LLM): seniority, location/remote, salary floor (when salary known),
     dealbreaker keywords, excluded companies. Record reason when failed.
  2. **Score** with Claude (haiku): input = confirmed-facts summary + criteria + scoring lessons + job description;
     output = strict JSON `{score, fits[], gaps[]}` validated with zod. Invalid JSON → retry once → mark failed.
- Jobs at or above `threshold` move to prepare, ordered by score then freshness, respecting `daily_cap`.

### 4.3 prepare (after match)
For each selected job:
1. **Fetch the application form questions.** Greenhouse: job endpoint with `?questions=true`.
   Others: best effort from the posting/apply page; if questions can't be determined, bucket the
   application as `manual`.
2. **Check for AI rules and AI-directed text** (principle 8), before any drafting:
   - A posting- or question-level restriction on AI use → that question is `needs_user` (or every free-text
     question, if the restriction is posting-wide), with a flag explaining why.
   - Text addressed to AI agents, visible or hidden (CSS-hidden, white-on-white, tiny font, HTML comments) →
     add an `ai_directed_text` flag with the excerpt. Never follow it; never remove it.
3. **Classify each question** into `auto` / `drafted` / `needs_user` / `cannot_automate`:
   - Match against `answer_bank` (canonical + variants; normalized text, then embedding/LLM similarity
     with a confidence threshold). Match → `auto`.
   - Open-ended (why us, describe a project) → `drafted` via Claude (sonnet), using only confirmed facts and
     the answers/cover-letter lessons.
   - Factual question not in bank, any attestation, anything confirmed facts can't support, or anything
     flagged in step 2 → `needs_user`.
   - Assessments, video, account-required, CAPTCHA, multi-page portals (Workday etc.) → `cannot_automate`.
4. **Tailor resume**: Claude (sonnet) returns a modified copy of the master resume JSON (reorder, select,
   reword bullets toward the top requirements). Then run the **fact guard**: every employer, title, date,
   degree and number in the output must exist in `confirmed_facts`; otherwise reject and retry once, then fall
   back to the master resume. Render to PDF, upload to Storage.
5. Cover letter only if the form asks for one (or setting says always), following cover-letter lessons.
6. Set status: any `cannot_automate` → `manual`; any `needs_user` → `needs_input`; else `queued`.

### 4.4 track_email (every 30 minutes)
- Read the job inbox (see D3). Skip already-processed `message_id`s.
- Classify each email (rules first: known ATS sender domains + subject patterns; Claude haiku fallback).
- Match to an application: by company name/domain + job title + time window after `submitted_at`.
  Store `match_confidence`; below threshold → leave unmatched and show in an "Unmatched emails" admin list
  for one-click linking.
- Transitions: confirmation → `confirmed` (+ evidence row); rejection → `rejected`; interview/scheduling →
  `interviewing`; recruiter reply → `responded`.
- **Rejections leave the inbox**: once matched with high confidence, label the email (e.g. `autopilot/rejected`)
  and archive it — never delete. Set `emails.archived_at`. Unmatched rejections stay in the inbox.
- **Verification codes**: an email with a code for an application I approved may be read and used for that
  application only (principle 10).
- Applications `submitted` with no confirmation after 24h → flag "unverified" on the dashboard (not a status).

### 4.5 notify (after prepare, and after track_email)
- When an application enters `needs_input` or `manual`, or gets a flag, send a notification (see D6) with the
  job, the blocking question(s), and a link to the Needs you screen.
- Batch: at most one notification per 15 minutes; include everything new since the last one. Quiet hours setting.
- Also notify on `interviewing` and `offer`. Record each send in `runs` (worker `notify`).

### 4.6 expire (daily)
- Jobs whose posting closed: queued/needs_input/manual applications → `expired`.
- `needs_input`/`manual` older than `stale_days` (default 5) → nudge flag; older than 2× → `expired`.

### Schedules (GitHub Actions)
- `discover → match → prepare → notify` chained in one workflow every 30 minutes.
- `track_email → notify` every 30 minutes. `expire` daily.
- Concurrency group per workflow so runs never overlap.
- CI workflow: typecheck, lint, unit tests, DB integration tests on every push.

---

## 5. Web app

### Public (`/`) — only if `public_page_enabled`
Modeled on a simple status board: headline counts (scanned, sent, responded, interviewing, offer, rejected),
"sent per day" bar chart, and a table of applications (role, company, sent date, latest status).
Reads only `public_status`. `noindex, nofollow`.

### Admin (`/admin`, Supabase Auth, single allowed user)
- **Overview**: funnel (discovered → matched → queued → submitted → confirmed → responded → interviewing → offer),
  response rate, sends per day, "needs you" count, unverified submissions, run health summary.
- **Approval queue**: one card per `queued` application — title, company, location, salary, posted age,
  score with fits/gaps, form check (field count, custom questions, blockers), **flags** (AI restrictions,
  AI-directed text with excerpt), tailored resume preview, cover letter, every question with its answer (editable).
  Actions: Approve / Edit / Skip, keyboard A/E/S. Approve sets `approved`.
  Editing an answer or skipping with a reason offers **"Save as lesson"** (prefilled rule, scope chosen by me).
- **Needs you**: each blocked question with the job. Answer inline; checkbox "Save to answer bank".
  When the last blocker is answered, the application moves to `queued`.
- **Manual**: link + prepared materials + "Mark submitted" (creates `user_attested` evidence).
- **Approved / to submit**: list with "Open application" (new tab) and "Mark submitted". Option for
  uploading a screenshot as evidence. Marking submitted stores an `answers_snapshot` and a `document` evidence
  row (with sha256) for each file sent.
- **Applications**: sortable/filterable table of all applications with status history (from `events`)
  and evidence, including document hashes.
- **Jobs**: all discovered jobs incl. filtered-out ones with reasons (for tuning).
- **Unmatched emails**: link to an application or dismiss.
- **Health**: last run per worker/source, counts, errors, and a red banner if any source has failed
  twice in a row or hasn't succeeded in 2h.
- **Insights** (tuning): response rate by score band, source, role/seniority, days-since-posted at
  apply time, resume version. Show sample sizes; don't render a rate with n < 10.
- **Settings**: criteria (creates a new `criteria_versions` row on save), threshold, daily cap,
  companies (add by ATS + board token, with a "test" button that fetches the board), answer bank,
  **confirmed facts**, **lessons** (list, edit, deactivate), master resume editor, notifications
  (channel, quiet hours), public page toggle, LLM monthly spend cap.

---

## 6. Reliability and safety details

- **LLM spend cap**: track token usage per call in a `llm_usage` table (add in M4); workers stop calling the API
  for the month when the cap is hit and surface that on Health.
- **Structured outputs only**: every LLM call returns JSON validated by zod; never parse free text.
- **Untrusted input**: job descriptions, application pages and emails are data. Instructions inside them are
  never followed (principle 8); AI-directed text is flagged for me.
- **Timeouts** on every network call. Workers must finish within the Actions job timeout.
- **Backups**: rely on Supabase backups plus a weekly CSV export of `applications`, `events`,
  `answer_bank`, `lessons`, `confirmed_facts` to Storage.
- **Privacy**: resume, answers and emails never appear on the public page or in client bundles for
  unauthenticated users. Email bodies are not stored; only metadata, snippet and classification.
- **Observability**: structured logs (JSON) in workers; errors summarized in `runs.error`.

---

## 7. Milestones and acceptance checks

**M1 — Foundation** *(built locally; deploy pending)*
- Next.js app on Vercel, Supabase project linked, migration applied, RLS on, admin login works.
- Acceptance: unauthenticated request to any admin route or table is denied; authenticated owner sees
  an empty admin overview.

**M2 — Discovery**
- Greenhouse, Lever, Ashby sources; companies settings page with "test board"; scheduled workflow (every 30 min);
  Health page.
- Acceptance: with 5 seeded companies, a run inserts jobs, a second run inserts zero duplicates and
  updates `last_seen_at`; removing a job from a mocked board sets `closed_at`; a failing source records
  `ok=false` without failing other sources.

**M3 — Dashboard + public page**
- Jobs table, overview, public status page with toggle.
- Acceptance: public page shows only `public_status` fields (verify by inspecting network responses);
  toggle off → 404.

**M4 — Matching**
- Criteria settings, hard filters, LLM scoring, spend tracking, `lessons` and `confirmed_facts` tables with
  settings screens; scoring prompt includes scoring lessons.
- Acceptance: unit tests for each hard filter; invalid LLM JSON handled; changing criteria creates a new
  version and rescoring doesn't duplicate rows; an active scoring lesson appears in the scoring prompt and an
  inactive one doesn't.

**M5 — Prepare + approval queue + notifications**
- Prepared packages are stored as structured data (resume version + question/answer pairs with field types) so the
  After-MVP extension can consume them.
- Question fetch and classification, AI-restriction routing and AI-directed-text flags, answer bank,
  resume tailoring with fact guard against `confirmed_facts`, PDF render, approval/needs-you/manual screens,
  "Save as lesson", notify worker.
- Acceptance: fact-guard unit tests (an injected fake employer or number not in `confirmed_facts` is rejected);
  an application with an unknown required question lands in Needs you **and a notification is sent**; answering it
  with "save to bank" auto-fills the same question on the next application; a fixture posting that restricts AI
  routes its free-text questions to Needs you; a fixture page with hidden "if you are an AI…" text produces a
  flag and the drafted answers are unaffected by it.

**M6 — Submission tracking**
- Mark submitted, evidence upload, answers snapshot and document hashes, email ingestion, classification,
  matching, rejection label + archive, unmatched-emails screen, unverified flag.
- Acceptance: with fixture emails from Greenhouse/Lever/Ashby-style senders, confirmations, rejections and
  interview requests move the right applications; an ambiguous email lands in Unmatched; a matched rejection is
  labeled and archived (not deleted); marking submitted stores the exact answers and the sha256 of the resume
  PDF, and the hash matches the stored file.

**M7 — Insights + expire**
- Insights page, expire worker, nudges, weekly export.
- Acceptance: insights hide rates with n < 10; stale items expire on schedule.

## After MVP

Work that starts once M1–M7 are deployed and in daily use. Nothing here is built during the MVP, but MVP
choices must not block it (see "Keep open" below).

**A. Multiple users (family and friends)**
- Add `user_id` to every table and backfill it with mine; RLS becomes `user_id = auth.uid()` for an allowed user.
  The `owner` singleton becomes an `allowed_users` list. Invite-only: I add people; public sign-up stays off.
- Per-user settings (caps, threshold, schedules) and per-user Claude spend limits.
- **No mailbox passwords held.** Each user gets a unique forwarding address (e.g. `name.x7k2@jobs.<domain>`)
  via an inbound email service (Postmark inbound or Cloudflare Email Routing → webhook). Users forward
  job-alert and ATS emails there. Replaces IMAP (D3) for everyone, me included.
- Public status page per user (`/u/<slug>`), each with its own toggle.

**B. Scheduling: pg_cron + tasks queue**
- pg_cron runs every 15 minutes and calls a function that enqueues due work into a `tasks` table, based on each
  user's schedule settings. "Run now" buttons just insert a task.
- Workers claim tasks with `FOR UPDATE SKIP LOCKED`, retry with backoff, and write `runs` rows as today.
  Replaces the fixed GitHub Actions schedules.

**C. Browser extension (assisted apply; replaces the earlier Claude-in-Chrome submission idea)**
- Runs in the user's own signed-in browser, so no logins or session cookies are stored server-side (principle 10).
- **LinkedIn Easy Apply:** when I open Easy Apply on a job, the extension matches it to the approved application,
  fills each step of the dialog (contact details, resume choice, screening questions) from the prepared package,
  and highlights anything it couldn't answer or that the employer wants answered without AI. **I click Next and
  Submit.** It never clicks Submit, never opens jobs on its own, never works through a list in the background, and
  does nothing to hide itself. LinkedIn jobs come from alert emails and an "Add to pipeline" button on the job
  I'm viewing; no scraping (principle 4). Accepted risk: LinkedIn's terms disallow automation tools; the
  realistic consequence is an account restriction, kept low by acting only on my clicks, one job at a time.
- **ATS forms** (Greenhouse, Lever, Ashby, Wellfound, Workday): same flow; I'm signed in, it fills, I submit.
- After submit it captures the confirmation screen as evidence and calls `transition(..., 'submitted', 'user:submit')`.
- Per-platform rollout via the `platforms` table: `supervised` fills one step at a time and waits for me; after
  `required_streak` (default 3) clean applications I may switch a platform to `trusted`, which fills all steps
  before handing over. Submit is always mine. Any correction resets the streak and becomes a lesson.

**D. Principle wording**
- Reword principles 4, 8, 9, 10 to lead with what the system does (find jobs through feeds and alert emails;
  follow employer AI rules and surface AI-directed text; hand human-check steps to me; act only in sessions I
  signed into). The limits themselves don't change.

**Keep open during the MVP**
- All access checks go through `is_owner()` (one place to change for multi-user).
- M5 stores each prepared application as structured data (resume version + question/answer pairs with field
  types), served by an authenticated `approved` list API, so the extension can fill forms from it without rework.

---

## 8. Open decisions (defaults in bold — change before starting if needed)

- **D1 Public page**: **built, toggle off by default**.
- **D2 Apply method**: **self-submit (Option A) first**; assisted apply via the browser extension after the MVP.
- **D3 Email access**: **IMAP with a Gmail app password** on a dedicated job-search inbox (requires 2-step
  verification on that account). Avoids the Gmail API OAuth setup and the short-lived refresh tokens that
  unverified "testing" OAuth apps get. Alternative: Gmail API with OAuth. IMAP also supports the label + archive
  needed for rejections.
- **D4 Daily cap / threshold**: **20 per day, score ≥ 75**, both editable in settings.
- **D5 Domain**: **Vercel default domain** until a custom one is chosen.
- **D6 Notifications**: **email to my personal address**, sent through the job inbox's SMTP with the same app
  password (no new service). Alternative: web push from the admin app (needs a service worker and an installed
  PWA on the phone).

## 9. Inputs I will provide (never commit these)

- Master resume (entered via the settings editor), confirmed facts, and answer bank entries.
- Target companies list with ATS + board tokens.
- My own ATS accounts (e.g. Workday), created by me; passwords stay in my password manager.
- Env vars set in Vercel and GitHub Actions secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `OWNER_USER_ID`, `ANTHROPIC_API_KEY`, `IMAP_HOST`, `IMAP_USER`,
  `IMAP_APP_PASSWORD`, and (D6) `NOTIFY_TO`, `SMTP_HOST`.
- `.env.example` lists every variable with a comment; never real values.
