// Run-health rules shared by the discover worker (backoff) and the Health page.
// Inputs come from the run_source_status view (one row per worker source) and
// the latest worker-level runs row (source = null).

/** A source with no successful run for this long is flagged on Health. */
export const STALE_AFTER_MS = 2 * 60 * 60 * 1000;
/** After two failures in a row, a board is retried at most this often. */
export const BACKOFF_MS = 2 * 60 * 60 * 1000;

/** Latest state of one worker source (e.g. `greenhouse:stripe`), from `run_source_status`. */
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
 */
export function sourceProblem(status: SourceStatus | undefined, now: Date): string | null {
  if (!status) return null;
  if (status.consecutive_failures >= 2) return `failed ${status.consecutive_failures} runs in a row`;
  if (age(status.last_success_at ?? status.first_run_at, now) > STALE_AFTER_MS) return "no successful run in 2h";
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
 * Why the worker schedule itself needs attention (never ran, stale, or the last
 * run failed), or `null` when it is fine.
 */
export function workerProblem(lastRun: WorkerRun | null, now: Date): string | null {
  if (!lastRun) return "has never run";
  if (age(lastRun.started_at, now) > STALE_AFTER_MS) return "hasn't run in 2h";
  if (lastRun.ok === false) return `last run failed: ${lastRun.error ?? "unknown error"}`;
  return null;
}
