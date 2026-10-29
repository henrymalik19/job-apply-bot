import type { Db, Json } from "@/server/db/types";
import type { SourceStatus, WorkerRun } from "@/server/modules/runs/run-health";
import { check, unwrap } from "@/server/core/errors";

/** Final state written to a `runs` row. */
export type RunResult = { ok: boolean; counts: Record<string, number>; error?: string };

/**
 * Opens a `runs` row and returns its id.
 *
 * @param source - `null` for the worker-level row, or a source key like `greenhouse:stripe`.
 */
export async function startRun(db: Db, worker: string, source: string | null): Promise<string> {
  return unwrap(await db.from("runs").insert({ worker, source }).select("id").single(), "start run").id;
}

/** Closes a `runs` row with its outcome. Errors are truncated to 500 characters. */
export async function finishRun(db: Db, id: string, result: RunResult): Promise<void> {
  check(
    await db
      .from("runs")
      .update({
        finished_at: new Date().toISOString(),
        ok: result.ok,
        counts: result.counts as Json,
        error: result.error?.slice(0, 500) ?? null,
      })
      .eq("id", id),
    "finish run",
  );
}

/** Latest status of every source of a worker, from the `run_source_status` view. */
export async function listSourceStatus(db: Db, worker: string): Promise<SourceStatus[]> {
  const rows = unwrap(
    await db
      .from("run_source_status")
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
    .from("runs")
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
