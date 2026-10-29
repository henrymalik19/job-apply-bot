import type { Db } from "@/server/db/types";
import { countByStatus, FUNNEL_STATUSES, NEEDS_YOU_STATUSES } from "@/server/modules/applications/applications.service";
import { getJobStats, getRecentJobs, type JobListItem } from "@/server/modules/jobs/jobs.service";
import { latestDiscoveryRun } from "@/server/modules/runs/runs.service";
import type { WorkerRun } from "@/server/modules/runs/runs.service";

/** One labeled number on the overview. */
export type Tile = { label: string; value: number };

/** Everything the overview page shows. */
export type Overview = {
  /** Open jobs, new in 24h, new in 7 days. */
  jobs: Tile[];
  /** Application funnel from queued to offer. */
  funnel: Tile[];
  /** Applications waiting on the owner. */
  needsYou: number;
  /** Last finished discovery run, if any. */
  lastRun: WorkerRun | null;
  /** Newest open jobs. */
  recent: JobListItem[];
};

/** Loads the overview: job numbers, the application funnel, the last discovery run and the newest jobs. */
export async function getOverview(db: Db, now: Date): Promise<Overview> {
  const [stats, byStatus, lastRun, recent] = await Promise.all([
    getJobStats(db, now),
    countByStatus(db),
    latestDiscoveryRun(db),
    getRecentJobs(db, 8),
  ]);
  return {
    jobs: [
      { label: "Open jobs", value: stats.open },
      { label: "New in 24h", value: stats.today },
      { label: "New in 7 days", value: stats.week },
    ],
    funnel: FUNNEL_STATUSES.map((s) => ({ label: s.replace("_", " "), value: byStatus[s] })),
    needsYou: NEEDS_YOU_STATUSES.reduce((sum, s) => sum + byStatus[s], 0),
    lastRun,
    recent,
  };
}
