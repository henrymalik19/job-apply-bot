import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  boardSource, sourceProblem, workerProblem, SOURCE_STATUS_COLUMNS, type SourceStatus, type WorkerRun,
} from "@/lib/health";

export type CompanyRow = {
  id: string;
  name: string;
  ats: string;
  board_token: string | null;
  priority: number;
  active: boolean;
};

export type BoardHealth = CompanyRow & { status: SourceStatus | undefined; problem: string | null };

// Companies with their discover status, plus the worker-level health. Reads as
// the signed-in owner (RLS applies).
export async function loadBoardHealth(db: SupabaseClient, now: Date) {
  const [companies, statuses, lastRun] = await Promise.all([
    db.from("companies").select("id, name, ats, board_token, priority, active")
      .order("active", { ascending: false }).order("priority", { ascending: false }).order("name"),
    db.from("run_source_status").select(SOURCE_STATUS_COLUMNS).eq("worker", "discover"),
    db.from("runs").select("started_at, finished_at, ok, counts, error")
      .eq("worker", "discover").is("source", null).not("ok", "is", null)
      .order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const err = companies.error ?? statuses.error ?? lastRun.error;
  if (err) throw new Error(`health query failed: ${err.message}`);

  const bySource = new Map((statuses.data as SourceStatus[]).map((s) => [s.source, s]));
  const boards: BoardHealth[] = (companies.data as CompanyRow[]).map((c) => {
    const status = c.board_token ? bySource.get(boardSource(c.ats, c.board_token)) : undefined;
    return { ...c, status, problem: c.active ? sourceProblem(status, now) : null };
  });
  const worker = lastRun.data as WorkerRun | null;
  const activeBoards = boards.filter((b) => b.active && b.ats !== "other");

  return {
    boards,
    worker,
    // Only nag about a stalled scheduler once there is something to discover.
    workerProblem: activeBoards.length ? workerProblem(worker, now) : null,
  };
}
