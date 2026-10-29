import { z } from "zod";

/** Seniority levels a job title can show. "unstated" = no level in the title. */
export const SENIORITY_LEVELS = ["junior", "mid", "senior", "staff", "principal", "lead", "manager", "director"] as const;
/** One seniority level. */
export type Seniority = (typeof SENIORITY_LEVELS)[number];

/**
 * What matching looks for, stored as a `criteria_versions` row. Every save
 * that changes it creates a new version, and jobs are scored per version.
 */
export const matchCriteriaSchema = z.object({
  /** Target roles, e.g. "Staff Software Engineer"; given to the scorer. */
  roles: z.array(z.string()).default([]),
  /** Seniority levels to keep; titles with no level always pass. Empty keeps all. */
  seniority: z.array(z.enum(SENIORITY_LEVELS)).default([]),
  /** Salary floor (yearly); only applied when the job states a salary. */
  min_salary: z.number().int().min(0).nullable().default(null),
  /** Words or phrases that rule a job out (title or description). */
  dealbreakers: z.array(z.string()).default([]),
  /** Companies never to match (e.g. the current employer). */
  excluded_companies: z.array(z.string()).default([]),
  /** Score at or above which a job moves on to prepare (M5). */
  threshold: z.number().int().min(0).max(100).default(75),
  /** Free-text preferences for the scorer ("product-focused teams, no on-call heavy roles"). */
  notes: z.string().max(2000).default(""),
});

/** Matching criteria. */
export type MatchCriteria = z.infer<typeof matchCriteriaSchema>;
