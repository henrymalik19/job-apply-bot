import type { Db } from "@/server/db/types";
import { listCompanies, type Company } from "@/server/modules/companies/companies.service";
import { boardSource, sourceProblem, workerProblem, type SourceStatus, type WorkerRun } from "./run-health";
import { latestWorkerRun, listSourceStatus } from "./runs.repository";

export { finishRun, listSourceStatus, startRun, type RunResult } from "./runs.repository";
export * from "./run-health";

/** A company with its board's latest discovery status. */
export type BoardHealth = Company & { status: SourceStatus | undefined; problem: string | null };

/** Everything the Health and Companies pages show about discovery. */
export type DiscoveryHealth = {
  boards: BoardHealth[];
  worker: WorkerRun | null;
  /** Problem with the schedule itself; only reported once there are boards to check. */
  workerProblem: string | null;
};

/**
 * Loads every company with its board status and the worker's last run.
 * Paused companies never report a problem.
 */
export async function loadDiscoveryHealth(db: Db, now: Date): Promise<DiscoveryHealth> {
  const [companies, statuses, worker] = await Promise.all([
    listCompanies(db),
    listSourceStatus(db, "discover"),
    latestWorkerRun(db, "discover"),
  ]);
  const bySource = new Map(statuses.map((s) => [s.source, s]));
  const boards = companies.map((c) => {
    const status = c.board_token ? bySource.get(boardSource(c.ats, c.board_token)) : undefined;
    return { ...c, status, problem: c.active ? sourceProblem(status, now) : null };
  });
  const hasActiveBoards = boards.some((b) => b.active && b.ats !== "other");
  return { boards, worker, workerProblem: hasActiveBoards ? workerProblem(worker, now) : null };
}
