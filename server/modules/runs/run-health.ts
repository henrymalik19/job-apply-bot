// Run-health rules shared by the discover worker (backoff) and the Health page.
// Inputs come from the worker_source_statuses view (one row per worker source) and
// the latest worker-level runs row (source = null).

/** Default discovery interval when `settings.discover_interval_minutes` is unset. */
export const DEFAULT_INTERVAL_MINUTES = 240;

/** Settings key holding the discovery interval; must match the Railway cron schedule. */
export const INTERVAL_SETTING_KEY = "discover_interval_minutes";

/** Minutes between match, prepare and notify runs; mirrors their Railway cron schedules. */
export const QUEUE_INTERVAL_MINUTES = 15;

/** The worker services, in pipeline order, with what each does (Health page). */
export const WORKERS = [
  { name: "discover", does: "Checks every job board for new and closed postings.", perUser: false },
  { name: "match", does: "Scores new jobs against your profile and criteria.", perUser: true },
  { name: "prepare", does: "Turns your best matches into applications, up to the daily cap.", perUser: true },
  { name: "notify", does: "Emails you when applications need you.", perUser: true },
] as const;

/**
 * How long without a successful run before Health flags it: two missed runs
 * plus 30 minutes of slack (Railway starts cron runs a few minutes late).
 *
 * @param intervalMinutes - Minutes between scheduled runs.
 */
export function staleAfterMs(intervalMinutes: number): number {
  return (2 * intervalMinutes + 30) * 60_000;
}

/** Human-readable duration, e.g. 30 → "30m", 240 → "4h", 510 → "8.5h". */
export function formatMinutes(minutes: number): string {
  return minutes < 60 ? `${minutes}m` : `${Math.round((minutes / 60) * 10) / 10}h`;
}
/** After two failures in a row, a board is retried at most this often. */
export const BACKOFF_MS = 2 * 60 * 60 * 1000;

/** Latest state of one worker source (e.g. `greenhouse:stripe`), from `worker_source_statuses`. */
export type SourceStatus = {
  worker: string;
  source: string;
  last_run_at: string;
  last_ok: boolean;
  last_error: string | null;
  last_counts: Record<string, number> | null;
  last_success_at: string | null;
  consecutive_failures: number;
  first_run_at: string;
};

/** A worker-level run (one per scheduled execution). */
export type WorkerRun = {
  started_at: string;
  finished_at: string | null;
  ok: boolean | null;
  counts: Record<string, number> | null;
  error: string | null;
};

/** The `runs.source` key for a job board, e.g. `greenhouse:stripe`. */
export const boardSource = (ats: string, token: string) => `${ats}:${token}`;

const age = (iso: string, now: Date) => now.getTime() - new Date(iso).getTime();

/**
 * Why a source needs attention, or `null` when it is fine. A source with no
 * runs yet (`status` undefined) is never a problem.
 *
 * @param status - The source's latest status, if it has run.
 * @param now - Reference time.
 * @param intervalMinutes - Minutes between scheduled runs.
 */
export function sourceProblem(
  status: SourceStatus | undefined,
  now: Date,
  intervalMinutes = DEFAULT_INTERVAL_MINUTES,
): string | null {
  if (!status) return null;
  if (status.consecutive_failures >= 2) return `failed ${status.consecutive_failures} runs in a row`;
  const stale = staleAfterMs(intervalMinutes);
  if (age(status.last_success_at ?? status.first_run_at, now) > stale) {
    return `no successful run in ${formatMinutes(stale / 60_000)}`;
  }
  return null;
}

/**
 * Whether to skip a board this run: it failed its last two runs and was last
 * tried less than {@link BACKOFF_MS} ago.
 */
export function shouldSkipBoard(status: SourceStatus | undefined, now: Date): boolean {
  return !!status && status.consecutive_failures >= 2 && age(status.last_run_at, now) < BACKOFF_MS;
}

/**
 * Why the worker schedule itself needs attention (never ran, missed two runs,
 * or the last run failed), or `null` when it is fine.
 *
 * @param intervalMinutes - Minutes between scheduled runs.
 */
export function workerProblem(
  lastRun: WorkerRun | null,
  now: Date,
  intervalMinutes = DEFAULT_INTERVAL_MINUTES,
): string | null {
  if (!lastRun) return "has never run";
  const stale = staleAfterMs(intervalMinutes);
  if (age(lastRun.started_at, now) > stale) return `hasn't run in ${formatMinutes(stale / 60_000)}`;
  if (lastRun.ok === false) return `last run failed: ${lastRun.error ?? "unknown error"}`;
  return null;
}
