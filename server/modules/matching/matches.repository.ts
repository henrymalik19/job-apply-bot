import type { Db, Insert, Row } from "@/server/db/types";
import { check, unwrap } from "@/server/core/errors";
import { jobFilterClauses, LIST_COLUMNS, type JobFilters, type JobListItem } from "@/server/modules/jobs/jobs.service";

/** A row of `matches`. */
export type Match = Row<"matches">;

/** Fields for recording one match outcome. */
export type NewMatch = Pick<
  Insert<"matches">,
  "user_id" | "job_id" | "hard_filter_passed" | "hard_filter_reason" | "score" | "reasons" | "model" | "status" | "error"
>;

/** Ids of jobs that already have a match for a user. */
export async function listMatchedJobIds(db: Db, userId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const rows = unwrap(
      await db.from("matches").select("job_id").eq("user_id", userId).order("id").range(from, from + 999),
      "list matched job ids",
    );
    for (const r of rows) ids.add(r.job_id);
    if (rows.length < 1000) return ids;
  }
}

/**
 * Records a match. A second result for the same user and job is ignored, so
 * re-running never duplicates rows (and a job, once matched, keeps its score).
 */
export async function insertMatch(db: Db, match: NewMatch): Promise<void> {
  check(
    await db.from("matches").upsert(match, { onConflict: "user_id,job_id", ignoreDuplicates: true }),
    "insert match",
  );
}

/** A user's matches for some jobs, keyed by job id. */
export async function matchesForJobs(db: Db, userId: string, jobIds: string[]): Promise<Map<string, Match>> {
  if (jobIds.length === 0) return new Map();
  const rows = unwrap(
    await db.from("matches").select("*").eq("user_id", userId).in("job_id", jobIds),
    "matches for jobs",
  );
  return new Map(rows.map((m) => [m.job_id, m]));
}

/** Counts of a user's match outcomes. */
export async function matchCounts(db: Db, userId: string, threshold: number) {
  const count = async (build: (q: ReturnType<typeof base>) => ReturnType<typeof base>, what: string) => {
    const res = await build(base());
    if (res.error) unwrap(res, what);
    return res.count ?? 0;
  };
  const base = () => db.from("matches").select("id", { count: "exact", head: true }).eq("user_id", userId);
  const [scored, aboveThreshold, filtered, failed] = await Promise.all([
    count((q) => q.eq("status", "scored"), "count scored"),
    count((q) => q.eq("status", "scored").gte("score", threshold), "count matched"),
    count((q) => q.eq("status", "filtered"), "count filtered"),
    count((q) => q.eq("status", "failed"), "count failed"),
  ]);
  return { scored, aboveThreshold, filtered, failed };
}

/** A job list row with its match outcome. */
export type MatchedJobRow = JobListItem & { score: number | null; matchStatus: string; filterReason: string | null };

/**
 * One page of jobs that have a match for the user in the given statuses, with the Jobs-page filters applied to the joined job and sorted by
 * score, posting date or found date. Starts from `matches` so it can filter and
 * sort on match fields in the database.
 *
 * @param statuses - Match statuses to include ("scored", "failed", "filtered").
 * @param minScore - Only scores at or above this (the threshold), or null.
 */
export async function searchMatchedJobs(
  db: Db,
  userId: string,
  options: { statuses: string[]; minScore: number | null },
  filters: JobFilters,
  page: number,
  pageSize: number,
  now: Date,
): Promise<{ rows: MatchedJobRow[]; total: number }> {
  const c = jobFilterClauses(filters, now);
  let query = db
    .from("matches")
    .select(`score, status, hard_filter_reason, jobs!inner(${LIST_COLUMNS})`, { count: "exact" })
    .eq("user_id", userId)
    .in("status", options.statuses);
  if (options.minScore != null) query = query.gte("score", options.minScore);
  if (c.text) query = query.or(c.text, { referencedTable: "jobs" });
  for (const [col, value] of c.eq) query = query.eq(`jobs.${col}`, value);
  for (const col of c.isNull) query = query.is(`jobs.${col}`, null);
  for (const col of c.notNull) query = query.not(`jobs.${col}`, "is", null);
  for (const [col, value] of c.gte) query = query.gte(`jobs.${col}`, value);
  query =
    filters.sort === "score"
      ? query.order("score", { ascending: false, nullsFirst: false })
      : query.order(filters.sort === "posted" ? "jobs(posted_at)" : "jobs(first_seen_at)", { ascending: false, nullsFirst: false });
  const from = (page - 1) * pageSize;
  const res = await query.order("id").range(from, from + pageSize - 1);
  if (res.error) unwrap(res, "search matched jobs");
  const rows = (res.data ?? []).map((r) => ({
    ...(r.jobs as unknown as JobListItem),
    score: r.score,
    matchStatus: r.status,
    filterReason: r.hard_filter_reason,
  }));
  return { rows, total: res.count ?? 0 };
}
