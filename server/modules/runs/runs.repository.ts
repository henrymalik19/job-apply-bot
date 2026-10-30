import type { Db, Json } from "@/server/db/types";
import type { SourceStatus, WorkerRun } from "@/server/modules/runs/run-health";
import { check, unwrap } from "@/server/core/errors";

/** Final state written to a `runs` row. */
export type RunResult = {
  ok: boolean;
  counts: Record<string, number>;
  error?: string;
  /** A few examples worth showing (e.g. titles discovery skipped, with the reason). */
  samples?: FilteredSample[];
};

/** One job discovery skipped, and why. */
export type FilteredSample = { title: string; company: string; reason: string };

/**
 * Opens a `runs` row and returns its id.
 *
 * @param source - `null` for the worker-level row, or a source key like `greenhouse:stripe`.
 * @param userId - The user a per-user run (match, prepare, notify) is for.
 */
export async function startRun(db: Db, worker: string, source: string | null, userId: string | null = null): Promise<string> {
  return unwrap(await db.from("worker_runs").insert({ worker, source, user_id: userId }).select("id").single(), "start run").id;
}

/** Closes a `runs` row with its outcome. Errors are truncated to 500 characters. */
export async function finishRun(db: Db, id: string, result: RunResult): Promise<void> {
  check(
    await db
      .from("worker_runs")
      .update({
        finished_at: new Date().toISOString(),
        ok: result.ok,
        counts: result.counts as Json,
        samples: (result.samples ?? null) as Json,
        error: result.error?.slice(0, 500) ?? null,
      })
      .eq("id", id),
    "finish run",
  );
}

/**
 * Marks runs that never finished (the process was killed, e.g. by a redeploy)
 * as failed, so Health and backoff see them. Only touches runs started before
 * `startedBefore`, never a run that may still be going.
 *
 * @returns How many runs were closed.
 */
export async function failInterruptedRuns(db: Db, worker: string, startedBefore: Date): Promise<number> {
  const rows = unwrap(
    await db
      .from("worker_runs")
      .update({ finished_at: new Date().toISOString(), ok: false, error: "interrupted (no finish recorded)" })
      .eq("worker", worker)
      .is("finished_at", null)
      .lt("started_at", startedBefore.toISOString())
      .select("id"),
    "fail interrupted runs",
  );
  return rows.length;
}

/** Latest status of every source of a worker, from the `worker_source_statuses` view. */
export async function listSourceStatus(db: Db, worker: string): Promise<SourceStatus[]> {
  const rows = unwrap(
    await db
      .from("worker_source_statuses")
      .select("worker, source, last_run_at, last_ok, last_error, last_counts, last_success_at, consecutive_failures, first_run_at")
      .eq("worker", worker),
    "list source status",
  );
  // View columns are nullable in the generated types; the view only emits
  // finished runs with a source, so these are always present.
  return rows as unknown as SourceStatus[];
}

/** The most recent finished worker-level run (`source` is null), if any. */
export async function latestWorkerRun(db: Db, worker: string): Promise<WorkerRun | null> {
  const res = await db
    .from("worker_runs")
    .select("started_at, finished_at, ok, counts, error")
    .eq("worker", worker)
    .is("source", null)
    .not("ok", "is", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (res.error) unwrap(res, "latest worker run");
  return (res.data as WorkerRun | null) ?? null;
}

/** Samples recorded by a worker's recent source runs, newest first. */
export async function recentSamples(db: Db, worker: string, limit: number): Promise<FilteredSample[]> {
  const rows = unwrap(
    await db
      .from("worker_runs")
      .select("samples")
      .eq("worker", worker)
      .not("samples", "is", null)
      .order("started_at", { ascending: false })
      .limit(100),
    "recent samples",
  );
  return rows.flatMap((r) => (Array.isArray(r.samples) ? (r.samples as FilteredSample[]) : [])).slice(0, limit);
}
