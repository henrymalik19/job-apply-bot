// Public API of the jobs module: discovery writes jobs through these, and the
// Jobs page, job detail and overview read through them.
import type { Db } from "@/server/db/types";
import { DEFAULT_PAGE_SIZE, pageOf, type Page } from "@/shared/paginate";
import type { JobFilters } from "./job-filters";
import { getJob, jobCounts, recentJobs, searchJobs, type Job, type JobListItem } from "./jobs.repository";

export {
  countJobs,
  deleteJobs,
  insertDiscoveredJobs,
  listExternalIds,
  listJobIdsWithApplications,
  listJobsForFiltering,
  jobFilterClauses,
  LIST_COLUMNS,
  listOpenJobsForMatching,
  syncBoard,
  type FilterableSavedJob,
  type MatchableJobRow,
  type NewJob,
} from "./jobs.repository";
export { filtersToParams, parseJobFilters, type JobFilters } from "./job-filters";
export type { Job, JobListItem } from "./jobs.repository";

/**
 * One page of jobs for the Jobs page. A page past the end returns an empty
 * page whose `total` still tells the pager how many match.
 */
export async function listJobs(db: Db, filters: JobFilters, page: number, now: Date): Promise<Page<JobListItem>> {
  const { rows, total } = await searchJobs(db, filters, page, DEFAULT_PAGE_SIZE, now);
  return pageOf(rows, total, page);
}

/** One job, or `null` when the id doesn't exist (or isn't a uuid). */
export async function findJob(db: Db, id: string): Promise<Job | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return getJob(db, id);
}

/** Job numbers for the overview: total, open, and new in the last 24 hours and 7 days. */
export async function getJobStats(db: Db, now: Date) {
  return jobCounts(db, {
    day: new Date(now.getTime() - 86_400_000),
    week: new Date(now.getTime() - 7 * 86_400_000),
  });
}

/** The latest open jobs, newest found first. */
export async function getRecentJobs(db: Db, limit = 8): Promise<JobListItem[]> {
  return recentJobs(db, limit);
}
