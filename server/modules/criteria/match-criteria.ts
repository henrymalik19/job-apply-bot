import { z } from "zod";

/** Seniority levels a job title can show. "unstated" = no level in the title. */
export const SENIORITY_LEVELS = ["junior", "mid", "senior", "staff", "principal", "lead", "manager", "director"] as const;
/** One seniority level. */
export type Seniority = (typeof SENIORITY_LEVELS)[number];

/**
 * What matching looks for (a `match_criteria` row). Changes apply to jobs
 * matched from then on; existing matches keep their score.
 */
export const matchCriteriaSchema = z.object({
  /** Target roles, e.g. "Staff Software Engineer"; given to the scorer. */
  roles: z.array(z.string()).default([]),
  /** Seniority levels to keep; titles with no level always pass. Empty keeps all. */
  seniority: z.array(z.enum(SENIORITY_LEVELS)).default([]),
  /** Salary floor (yearly): rules out jobs whose stated top is below it; the low end stated on forms. */
  salary_min: z.number().int().min(0).nullable().default(null),
  /** Top of the salary range stated on forms. */
  salary_max: z.number().int().min(0).nullable().default(null),
  /** Words or phrases that rule a job out (title or description). */
  dealbreakers: z.array(z.string()).default([]),
  /** Companies never to match (e.g. the current employer). */
  excluded_companies: z.array(z.string()).default([]),
  /** Score at or above which a job moves on to prepare (M5). */
  threshold: z.number().int().min(0).max(100).default(75),
  /** Free-text preferences for the scorer ("product-focused teams, no on-call heavy roles"). */
  notes: z.string().max(2000).default(""),
  /** Open to relocating for a job; null when not set. */
  willing_to_relocate: z.boolean().nullable().default(null),
});

/** Matching criteria. */
export type MatchCriteria = z.infer<typeof matchCriteriaSchema>;
