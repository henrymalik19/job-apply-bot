import { z } from "zod";
import type { Db, Json } from "@/server/db/types";
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
