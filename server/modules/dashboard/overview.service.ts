import type { Db } from "@/server/db/types";
import { countByStatus, FUNNEL_STATUSES, NEEDS_YOU_STATUSES } from "@/server/modules/applications/applications.service";
import { getJobStats, getRecentJobs, type JobListItem } from "@/server/modules/jobs/jobs.service";
import { getMatchSummary } from "@/server/modules/matching/matching.service";
import { latestDiscoveryRun } from "@/server/modules/runs/runs.service";
import type { WorkerRun } from "@/server/modules/runs/runs.service";

/** One labeled number on the overview. */
export type Tile = { label: string; value: number };

/** Everything the overview page shows. */
export type Overview = {
  /** Open jobs, new in 24h and 7 days, matched and scored under the current criteria. */
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
  const [stats, byStatus, lastRun, recent, matching] = await Promise.all([
    getJobStats(db, now),
    countByStatus(db),
    latestDiscoveryRun(db),
    getRecentJobs(db, 8),
    getMatchSummary(db),
  ]);
  return {
    jobs: [
      { label: "Open jobs", value: stats.open },
      { label: "New in 24h", value: stats.today },
      { label: "New in 7 days", value: stats.week },
      { label: `Matched (${matching.threshold}+)`, value: matching.aboveThreshold },
      { label: "Scored", value: matching.scored },
    ],
    funnel: FUNNEL_STATUSES.map((s) => ({ label: s.replace("_", " "), value: byStatus[s] })),
    needsYou: NEEDS_YOU_STATUSES.reduce((sum, s) => sum + byStatus[s], 0),
    lastRun,
    recent,
  };
}
