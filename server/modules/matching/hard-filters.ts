// Hard filters: cheap rules in code that rule a job out before any LLM call.
// Each returns a reason when the job fails, or null when it passes.
import type { MatchCriteria, Seniority } from "@/server/modules/criteria/match-criteria";
import { normalize } from "@/shared/text";

/** The job fields the hard filters read. */
export type MatchableJob = {
  title: string;
  company_name: string;
  description_md: string | null;
  salary_min: number | null;
  salary_max: number | null;
};

const has = (text: string, phrase: string) => {
  const p = normalize(phrase);
  return p.length > 0 && ` ${text} `.includes(` ${p} `);
};

// Most specific first: "senior staff" is staff, "engineering manager" is manager.
const LEVEL_PATTERNS: [Seniority, string[]][] = [
  ["director", ["director", "head of", "vp", "vice president"]],
  ["manager", ["manager", "engineering manager"]],
  ["principal", ["principal", "distinguished"]],
  ["staff", ["staff", "member of technical staff"]],
  ["lead", ["lead", "tech lead"]],
  ["senior", ["senior", "sr"]],
  ["junior", ["junior", "jr", "intern", "internship", "entry level", "new grad", "graduate", "associate", "apprentice"]],
  ["mid", ["mid level", "intermediate", "ii", "2"]],
];

/** The seniority a title states, or null when it states none ("Software Engineer"). */
export function titleSeniority(title: string): Seniority | null {
  const t = normalize(title);
  for (const [level, words] of LEVEL_PATTERNS) if (words.some((w) => has(t, w))) return level;
  return null;
}

/** Fails when the title states a level that isn't wanted. Titles with no level pass. */
export function seniorityFilter(job: MatchableJob, criteria: MatchCriteria): string | null {
  if (criteria.seniority.length === 0) return null;
  const level = titleSeniority(job.title);
  return level && !criteria.seniority.includes(level) ? `seniority: ${level}` : null;
}

/** Fails when the job's whole salary range is below the floor. Unknown salaries pass. */
export function salaryFilter(job: MatchableJob, criteria: MatchCriteria): string | null {
  if (criteria.min_salary == null) return null;
  const top = job.salary_max ?? job.salary_min;
  return top != null && top < criteria.min_salary ? `salary: ${top} below ${criteria.min_salary}` : null;
}

/** Fails when the title or description contains a dealbreaker word or phrase (whole words). */
export function dealbreakerFilter(job: MatchableJob, criteria: MatchCriteria): string | null {
  const text = normalize(`${job.title}\n${job.description_md ?? ""}`);
  const hit = criteria.dealbreakers.find((d) => has(text, d));
  return hit ? `dealbreaker: ${hit}` : null;
}

/** Fails for excluded companies (e.g. the current employer); case and punctuation ignored. */
export function companyFilter(job: MatchableJob, criteria: MatchCriteria): string | null {
  const company = normalize(job.company_name);
  const hit = criteria.excluded_companies.find((c) => normalize(c) === company);
  return hit ? `excluded company: ${hit}` : null;
}

/**
 * Runs every hard filter in order and returns the first failure's reason, or
 * null when the job passes them all (and should be scored).
 */
export function hardFilter(job: MatchableJob, criteria: MatchCriteria): string | null {
  return (
    companyFilter(job, criteria) ??
    seniorityFilter(job, criteria) ??
    salaryFilter(job, criteria) ??
    dealbreakerFilter(job, criteria)
  );
}
