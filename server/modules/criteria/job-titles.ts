// Target-role suggestions as you type: job titles employers use, from the jobs discovery has seen (cleaned
// up and counted by the database as each job arrives; see the job_titles migration).
import type { Db } from "@/server/db/types";
import { unwrap } from "@/server/core/errors";

/** Titles seen fewer times than this are one-offs ("Rockstar Ninja Developer"): not suggested. */
export const MIN_POSTINGS = 3;
/** Titles not posted in this long are out of date: not suggested. */
export const RECENT_DAYS = 90;

/** One suggestion: the title, and how many postings used it. */
export type JobTitleSuggestion = { title: string; postings: number };

/**
 * Job titles matching what you've typed: every word in it, those starting with it first, then the most posted.
 *
 * @param now - For "recent" (tests pass a fixed date).
 */
export async function suggestJobTitles(db: Db, typed: string, limit = 8, now = new Date()): Promise<JobTitleSuggestion[]> {
  const words = typed.toLowerCase().replace(/[%_\\]/g, " ").split(/\s+/).filter(Boolean).slice(0, 6);
  if (words.length === 0) return [];
  let query = db
    .from("job_titles")
    .select("key, title, postings")
    .eq("has_role", true)
    .gte("postings", MIN_POSTINGS)
    .gte("last_seen_at", new Date(now.getTime() - RECENT_DAYS * 86_400_000).toISOString());
  for (const w of words) query = query.ilike("key", `%${w}%`);
  const rows = unwrap(await query.order("postings", { ascending: false }).limit(40), "suggest job titles");
  const start = words.join(" ");
  return rows
    .map((r, i) => ({ r, i, starts: r.key.startsWith(start) ? 0 : 1 }))
    .sort((a, b) => a.starts - b.starts || a.i - b.i)
    .slice(0, limit)
    .map(({ r }) => ({ title: r.title, postings: r.postings }));
}
