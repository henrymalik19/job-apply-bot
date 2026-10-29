import { z } from "zod";
import type { Db, Json, Row } from "@/server/db/types";
import type { JobFilters } from "./job-filters";
import { unwrap } from "@/server/core/errors";

const PAGE = 1000;

/** A job ready to insert: a parsed posting plus company fields and `dedup_key`. */
export type NewJob = {
  company_id: string;
  company_name: string;
  source: string;
  external_id: string;
  url: string;
  apply_url: string | null;
  title: string;
  location: string | null;
  remote_type: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  description_md: string | null;
  posted_at: string | null;
  dedup_key: string;
  raw: Record<string, unknown>;
};

const insertResult = z.object({ inserted: z.number(), duplicates: z.number() });
const syncResult = z.object({ seen: z.number(), closed: z.number() });

/** Columns shown in job lists. */
const LIST_COLUMNS =
  "id, title, company_name, location, remote_type, salary_min, salary_max, salary_currency, posted_at, first_seen_at, closed_at, url, source";

/** One row of the Jobs list. */
export type JobListItem = Pick<
  Row<"jobs">,
  | "id" | "title" | "company_name" | "location" | "remote_type" | "salary_min" | "salary_max" | "salary_currency"
  | "posted_at" | "first_seen_at" | "closed_at" | "url" | "source"
>;

/** A full job, for the detail page. */
export type Job = Row<"jobs">;

/**
 * One page of jobs matching the filters, plus the total match count.
 *
 * @param page - 1-based page number.
 */
export async function searchJobs(
  db: Db,
  filters: JobFilters,
  page: number,
  pageSize: number,
  now: Date,
): Promise<{ rows: JobListItem[]; total: number }> {
  let query = db.from("jobs").select(LIST_COLUMNS, { count: "exact" });
  if (filters.q) query = query.or(`title.ilike.%${filters.q}%,company_name.ilike.%${filters.q}%`);
  if (filters.remote !== "any") query = query.eq("remote_type", filters.remote);
  if (filters.state === "open") query = query.is("closed_at", null);
  if (filters.state === "closed") query = query.not("closed_at", "is", null);
  if (filters.posted !== "any") {
    // Jobs without a posting date are rare (every supported board sends one) and are left out here.
    const since = new Date(now.getTime() - Number(filters.posted) * 86_400_000);
    query = query.gte("posted_at", since.toISOString());
  }
  if (filters.found !== "any") {
    const since = new Date(now.getTime() - Number(filters.found) * 86_400_000);
    query = query.gte("first_seen_at", since.toISOString());
  }
  query =
    filters.sort === "posted"
      ? query.order("posted_at", { ascending: false, nullsFirst: false })
      : query.order("first_seen_at", { ascending: false });
  const from = (page - 1) * pageSize;
  const res = await query.order("id").range(from, from + pageSize - 1);
  if (res.error) unwrap(res, "search jobs");
  return { rows: (res.data ?? []) as JobListItem[], total: res.count ?? 0 };
}

/** One job by id, or `null` when it doesn't exist. */
export async function getJob(db: Db, id: string): Promise<Job | null> {
  const res = await db.from("jobs").select("*").eq("id", id).maybeSingle();
  if (res.error) unwrap(res, "get job");
  return res.data;
}

/** Counts for the overview: all jobs, open ones, and those first found since each cutoff. */
export async function jobCounts(db: Db, since: { day: Date; week: Date }) {
  const count = async (build: (q: ReturnType<typeof base>) => ReturnType<typeof base>, what: string) => {
    const res = await build(base());
    if (res.error) unwrap(res, what);
    return res.count ?? 0;
  };
  const base = () => db.from("jobs").select("id", { count: "exact", head: true });
  const [total, open, today, week] = await Promise.all([
    count((q) => q, "count jobs"),
    count((q) => q.is("closed_at", null), "count open jobs"),
    count((q) => q.gte("first_seen_at", since.day.toISOString()), "count new jobs today"),
    count((q) => q.gte("first_seen_at", since.week.toISOString()), "count new jobs this week"),
  ]);
  return { total, open, today, week };
}

/** The most recently found open jobs. */
export async function recentJobs(db: Db, limit: number): Promise<JobListItem[]> {
  return unwrap(
    await db.from("jobs").select(LIST_COLUMNS).is("closed_at", null).order("first_seen_at", { ascending: false }).limit(limit),
    "recent jobs",
  ) as JobListItem[];
}

/** The fields needed to re-check a saved job against the discovery filters. */
export type FilterableSavedJob = Pick<Row<"jobs">, "id" | "title" | "location" | "remote_type" | "posted_at" | "raw">;

/** Every saved job's filter fields, paged past PostgREST's 1,000-row limit. */
export async function listJobsForFiltering(db: Db): Promise<FilterableSavedJob[]> {
  const all: FilterableSavedJob[] = [];
  for (let from = 0; ; from += PAGE) {
    const rows = unwrap(
      await db
        .from("jobs")
        .select("id, title, location, remote_type, posted_at, raw")
        .order("id")
        .range(from, from + PAGE - 1),
      "list jobs for filtering",
    );
    all.push(...rows);
    if (rows.length < PAGE) return all;
  }
}

/** Ids of jobs that have an application (never deleted by cleanup). */
export async function listJobIdsWithApplications(db: Db): Promise<Set<string>> {
  const rows = unwrap(await db.from("applications").select("job_id"), "list applied job ids");
  return new Set(rows.map((r) => r.job_id));
}

/** Deletes jobs by id in batches. */
export async function deleteJobs(db: Db, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 200) {
    const res = await db.from("jobs").delete().in("id", ids.slice(i, i + 200));
    if (res.error) unwrap(res, "delete jobs");
  }
}

/** Total number of jobs, open or closed. */
export async function countJobs(db: Db): Promise<number> {
  const res = await db.from("jobs").select("id", { count: "exact", head: true });
  if (res.error) unwrap(res, "count jobs");
  return res.count ?? 0;
}

/**
 * External ids of every job already stored for one company board, paged past
 * PostgREST's 1,000-row limit.
 */
export async function listExternalIds(db: Db, companyId: string, source: string): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const rows = unwrap(
      await db
        .from("jobs")
        .select("external_id")
        .eq("company_id", companyId)
        .eq("source", source)
        .order("id")
        .range(from, from + PAGE - 1),
      "list external ids",
    );
    for (const r of rows) if (r.external_id) ids.add(r.external_id);
    if (rows.length < PAGE) return ids;
  }
}

/**
 * Inserts new jobs through `insert_discovered_jobs` (service role only). Rows
 * that collide on `(source, external_id)` or `dedup_key` are skipped.
 */
export async function insertDiscoveredJobs(db: Db, jobs: NewJob[]): Promise<{ inserted: number; duplicates: number }> {
  const res = await db.rpc("insert_discovered_jobs", { p_jobs: jobs as unknown as Json });
  return insertResult.parse(unwrap(res, "insert jobs"));
}

/**
 * Records a successful board fetch through `sync_board` (service role only):
 * listed jobs get `last_seen_at` (and reopen), unlisted ones close. Never call
 * after a failed fetch.
 *
 * @param externalIds - Every id the board listed, including filtered-out ones.
 */
export async function syncBoard(
  db: Db,
  companyId: string,
  source: string,
  externalIds: string[],
): Promise<{ seen: number; closed: number }> {
  const res = await db.rpc("sync_board", { p_company_id: companyId, p_source: source, p_external_ids: externalIds });
  return syncResult.parse(unwrap(res, "sync board"));
}
