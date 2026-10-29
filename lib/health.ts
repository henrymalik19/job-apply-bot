// Run-health rules shared by the discover worker (backoff) and the Health page.
// Inputs come from the run_source_status view (one row per worker source) and
// the latest worker-level runs row (source = null).

export const STALE_AFTER_MS = 2 * 60 * 60 * 1000;
export const BACKOFF_MS = 2 * 60 * 60 * 1000;

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

export type WorkerRun = {
  started_at: string;
  finished_at: string | null;
  ok: boolean | null;
  counts: Record<string, number> | null;
  error: string | null;
};

export const SOURCE_STATUS_COLUMNS =
  "worker, source, last_run_at, last_ok, last_error, last_counts, last_success_at, consecutive_failures, first_run_at";

export const boardSource = (ats: string, token: string) => `${ats}:${token}`;

const age = (iso: string, now: Date) => now.getTime() - new Date(iso).getTime();

// A source with no runs yet (status undefined) has no problem.
export function sourceProblem(status: SourceStatus | undefined, now: Date): string | null {
  if (!status) return null;
  if (status.consecutive_failures >= 2) return `failed ${status.consecutive_failures} runs in a row`;
  if (age(status.last_success_at ?? status.first_run_at, now) > STALE_AFTER_MS) return "no successful run in 2h";
  return null;
}

// Back off a board that failed its last two runs: retry at most every BACKOFF_MS.
export function shouldSkipBoard(status: SourceStatus | undefined, now: Date): boolean {
  return !!status && status.consecutive_failures >= 2 && age(status.last_run_at, now) < BACKOFF_MS;
}

// The worker-level row proves the schedule itself is running.
export function workerProblem(lastRun: WorkerRun | null, now: Date): string | null {
  if (!lastRun) return "has never run";
  if (age(lastRun.started_at, now) > STALE_AFTER_MS) return "hasn't run in 2h";
  if (lastRun.ok === false) return `last run failed: ${lastRun.error ?? "unknown error"}`;
  return null;
}
