import type { Db } from "@/server/db/types";
import { countByStatus, FUNNEL_STATUSES, NEEDS_YOU_STATUSES } from "@/server/modules/applications/applications.service";
import { countJobs } from "@/server/modules/jobs/jobs.service";

/** One labeled number on the overview. */
export type Tile = { label: string; value: number };

/** Discovered jobs, the application funnel and the "Needs you" count, in display order. */
export async function getOverviewTiles(db: Db): Promise<Tile[]> {
  const [jobs, byStatus] = await Promise.all([countJobs(db), countByStatus(db)]);
  return [
    { label: "Discovered", value: jobs },
    ...FUNNEL_STATUSES.map((s) => ({ label: s.replace("_", " "), value: byStatus[s] })),
    { label: "Needs you", value: NEEDS_YOU_STATUSES.reduce((sum, s) => sum + byStatus[s], 0) },
  ];
}
