import type { Db } from "@/server/db/types";
import { unwrap } from "@/server/core/errors";

/**
 * The only fields the public page ever reads. `public_applications` already hides
 * pre-submission statuses; the job URL and row id are left out on purpose.
 */
export type PublicApplication = {
  job_title: string;
  company_name: string;
  status: string;
  submitted_at: string | null;
  last_status_at: string;
};

/** A user's applications visible on the public page, most recent activity first. Service role only. */
export async function listPublicApplications(db: Db, userId: string, limit = 500): Promise<PublicApplication[]> {
  return unwrap(
    await db
      .from("public_applications")
      .select("job_title, company_name, status, submitted_at, last_status_at")
      .eq("user_id", userId)
      .order("last_status_at", { ascending: false })
      .limit(limit),
    "list public applications",
  ) as PublicApplication[];
}

/** How many jobs discovery has scanned (a count only, no job details). */
export async function countScannedJobs(db: Db): Promise<number> {
  const res = await db.from("jobs").select("id", { count: "exact", head: true });
  if (res.error) unwrap(res, "count scanned jobs");
  return res.count ?? 0;
}
