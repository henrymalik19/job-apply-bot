// Jobs the apply runner found in a LinkedIn search (Easy Apply only), saved like jobs from a company's board:
// under their company (found by name, or added without a board), which you follow, so matching scores them
// against your criteria and company limits apply. The same posting seen on the company's own board is
// skipped (same company, title and location).
import { z } from "zod";
import type { Db } from "@/server/db/types";
import { insertDiscoveredJobs, type NewJob } from "@/server/modules/jobs/jobs.repository";
import { unwrap } from "@/server/core/errors";
import { dedupKey } from "@/shared/text";

/** One job as read from LinkedIn's job page. */
export const linkedinJobSchema = z.object({
  id: z.string().regex(/^\d{5,20}$/),
  title: z.string().min(1).max(300),
  company: z.string().min(1).max(200),
  location: z.string().max(200).nullable(),
  remoteType: z.enum(["remote", "hybrid", "onsite", "unknown"]),
  salaryMin: z.number().int().positive().nullable(),
  salaryMax: z.number().int().positive().nullable(),
  description: z.string().max(40_000),
  postedAt: z.string().datetime().nullable(),
});
/** A job read from LinkedIn. */
export type LinkedInJob = z.infer<typeof linkedinJobSchema>;

/** A company by name (or another name it goes by); added without a board when there's none. */
async function companyFor(db: Db, name: string): Promise<{ id: string; name: string }> {
  const pattern = name.replace(/[\\%_]/g, (c) => `\\${c}`);
  const found = unwrap(await db.from("companies").select("id, name").ilike("name", pattern).order("created_at").limit(1), "find company");
  if (found[0]) return found[0];
  const other = unwrap(await db.from("companies").select("id, name").contains("other_names", [name]).limit(1), "find company by other name");
  if (other[0]) return other[0];
  return unwrap(await db.from("companies").insert({ name, ats: "other" }).select("id, name").single(), "add company");
}

/**
 * Saves LinkedIn jobs for a user: each under its company, which the user then follows.
 *
 * @param db - A service-role client (jobs and companies are shared).
 * @returns How many were new, and how many were already known.
 */
export async function saveLinkedInJobs(db: Db, userId: string, jobs: LinkedInJob[]): Promise<{ inserted: number; duplicates: number }> {
  const rows: NewJob[] = [];
  for (const j of jobs) {
    const company = await companyFor(db, j.company);
    unwrap(await db.from("user_companies").upsert({ user_id: userId, company_id: company.id }, { onConflict: "user_id,company_id", ignoreDuplicates: true }).select("company_id"), "follow company");
    const url = `https://www.linkedin.com/jobs/view/${j.id}/`;
    rows.push({
      company_id: company.id,
      company_name: company.name,
      source: "linkedin",
      external_id: j.id,
      url,
      apply_url: url,
      title: j.title,
      location: j.location,
      remote_type: j.remoteType,
      salary_min: j.salaryMin,
      salary_max: j.salaryMax,
      salary_currency: j.salaryMin || j.salaryMax ? "USD" : null,
      description_md: j.description || null,
      posted_at: j.postedAt,
      dedup_key: dedupKey(company.name, j.title, j.location),
      raw: { easy_apply: true },
    });
  }
  return rows.length ? insertDiscoveredJobs(db, rows) : { inserted: 0, duplicates: 0 };
}
