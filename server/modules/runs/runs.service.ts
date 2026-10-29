import type { Db } from "@/server/db/types";
import { z } from "zod";
import { listCompanies, type Company } from "@/server/modules/companies/companies.service";
import { getSetting } from "@/server/modules/settings/settings.service";
import {
  boardSource,
  DEFAULT_INTERVAL_MINUTES,
  INTERVAL_SETTING_KEY,
  sourceProblem,
  workerProblem,
  type SourceStatus,
  type WorkerRun,
} from "./run-health";
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
  /** Minutes between scheduled runs (`settings.discover_interval_minutes`). */
  intervalMinutes: number;
};

/**
 * Minutes between discovery runs, from settings. This mirrors the Railway cron
 * schedule (Railway is what actually runs it), so update both together.
 */
export async function getDiscoveryInterval(db: Db): Promise<number> {
  const value = await getSetting(db, INTERVAL_SETTING_KEY);
  const parsed = z.number().int().positive().safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_INTERVAL_MINUTES;
}

/**
 * Loads every company with its board status and the worker's last run.
 * Paused companies never report a problem.
 */
export async function loadDiscoveryHealth(db: Db, now: Date): Promise<DiscoveryHealth> {
  const [companies, statuses, worker, intervalMinutes] = await Promise.all([
    listCompanies(db),
    listSourceStatus(db, "discover"),
    latestWorkerRun(db, "discover"),
    getDiscoveryInterval(db),
  ]);
  const bySource = new Map(statuses.map((s) => [s.source, s]));
  const boards = companies.map((c) => {
    const status = c.board_token ? bySource.get(boardSource(c.ats, c.board_token)) : undefined;
    return { ...c, status, problem: c.active ? sourceProblem(status, now, intervalMinutes) : null };
  });
  const hasActiveBoards = boards.some((b) => b.active && b.ats !== "other");
  return {
    boards,
    worker,
    workerProblem: hasActiveBoards ? workerProblem(worker, now, intervalMinutes) : null,
    intervalMinutes,
  };
}
