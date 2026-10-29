// Search criteria: what jobs the owner is looking for. Discovery pre-filters
// (job titles; work type, location and posting age) live in settings; matching
// criteria (roles, seniority, salary floor, dealbreakers, threshold) are
// versioned in criteria_versions so every score records what it was judged on.
import { z } from "zod";
import { ValidationError } from "@/server/core/errors";
import type { Db, Json } from "@/server/db/types";
import type { StructuredCall } from "@/server/integrations/anthropic/claude";
import { listActiveFacts } from "@/server/modules/profile/profile.service";
import { recordUsage } from "@/server/modules/usage/usage.service";
import * as settings from "@/server/modules/settings/settings.service";
import {
  JOB_FILTER_KEY,
  jobFilterSchema,
  parseLocations,
  WORK_TYPES,
  type JobFilter,
  type WorkType,
} from "./job-filter";
import { insertCriteriaVersion, latestCriteriaVersion } from "./criteria.repository";
import { matchCriteriaSchema, SENIORITY_LEVELS, type MatchCriteria, type Seniority } from "./match-criteria";
import { parseKeywords, TITLE_FILTER_KEY, titleFilterSchema, type TitleFilter } from "./title-filter";

export { matchCriteriaSchema, SENIORITY_LEVELS, type MatchCriteria, type Seniority } from "./match-criteria";
export {
  DEFAULT_MAX_AGE_DAYS,
  MAX_AGE_LIMIT_DAYS,
  jobFilterReason,
  passesJobFilter,
  WORK_TYPES,
  type JobFilter,
  type JobFilterReason,
  type WorkType,
} from "./job-filter";
export { passesTitleFilter, type TitleFilter } from "./title-filter";

/** The current title filter (empty lists when unset). */
export async function getTitleFilter(db: Db): Promise<TitleFilter> {
  return titleFilterSchema.parse((await settings.getSetting(db, TITLE_FILTER_KEY)) ?? {});
}

/**
 * Saves the title filter from comma- or newline-separated phrase lists.
 * Applies to jobs found from the next discovery run on.
 */
export async function saveTitleFilter(db: Db, include: string, exclude: string): Promise<TitleFilter> {
  const filter = { include: parseKeywords(include), exclude: parseKeywords(exclude) };
  await settings.putSetting(db, TITLE_FILTER_KEY, filter);
  return filter;
}

/** The current work-type, location and age filter (defaults: all types and places, 30 days). */
export async function getJobFilter(db: Db): Promise<JobFilter> {
  return jobFilterSchema.parse((await settings.getSetting(db, JOB_FILTER_KEY)) ?? {});
}

/** Raw values from the Search page's work-type and location form. */
export type JobFilterInput = {
  workTypes: string[];
  locations: string;
  keepUnknownWorkType: boolean;
  keepRemoteWithoutLocation: boolean;
  maxAgeDays: string;
};

/**
 * Saves the work-type, location and age filter. The age is clamped to 1–90
 * days. Applies to jobs found from the next discovery run on.
 */
export async function saveJobFilter(db: Db, input: JobFilterInput): Promise<JobFilter> {
  const filter = jobFilterSchema.parse({
    work_types: input.workTypes.filter((t): t is WorkType => (WORK_TYPES as readonly string[]).includes(t)),
    locations: parseLocations(input.locations),
    keep_unknown_work_type: input.keepUnknownWorkType,
    keep_remote_without_location: input.keepRemoteWithoutLocation,
    max_age_days: Math.trunc(Number(input.maxAgeDays)),
  });
  await settings.putSetting(db, JOB_FILTER_KEY, filter);
  return filter;
}

/** The current matching criteria and the id of the version they come from. */
export type CurrentCriteria = { versionId: string; criteria: MatchCriteria };

/**
 * The current matching criteria (the newest version). Creates a first version
 * with defaults when none exists, so matching always has a version to score against.
 */
export async function getMatchCriteria(db: Db): Promise<CurrentCriteria> {
  const latest = (await latestCriteriaVersion(db)) ?? (await insertCriteriaVersion(db, matchCriteriaSchema.parse({}) as NonNullable<Json>));
  return { versionId: latest.id, criteria: matchCriteriaSchema.parse(latest.criteria) };
}

/** Raw values from the matching-criteria form. */
export type MatchCriteriaInput = {
  roles: string;
  seniority: string[];
  minSalary: string;
  dealbreakers: string;
  excludedCompanies: string;
  threshold: string;
  notes: string;
};

/**
 * Saves matching criteria. Creates a new version only when something changed,
 * so jobs are rescored against the new criteria and old scores stay attached
 * to the version they were made with.
 *
 * @returns The current criteria and whether a new version was created.
 */
export async function saveMatchCriteria(db: Db, input: MatchCriteriaInput): Promise<CurrentCriteria & { created: boolean }> {
  const salary = Number(input.minSalary.replace(/[^0-9]/g, ""));
  const next = matchCriteriaSchema.parse({
    roles: parseKeywords(input.roles),
    seniority: input.seniority.filter((s): s is Seniority => (SENIORITY_LEVELS as readonly string[]).includes(s)),
    min_salary: salary > 0 ? salary : null,
    dealbreakers: parseKeywords(input.dealbreakers),
    excluded_companies: parseKeywords(input.excludedCompanies),
    threshold: Math.min(100, Math.max(0, Math.trunc(Number(input.threshold) || 0))),
    notes: input.notes.trim().slice(0, 2000),
  });
  const current = await getMatchCriteria(db);
  if (JSON.stringify(current.criteria) === JSON.stringify(next)) return { ...current, created: false };
  const row = await insertCriteriaVersion(db, next as NonNullable<Json>);
  return { versionId: row.id, criteria: next, created: true };
}

/** One suggested title phrase and why. */
export type TitleSuggestion = { phrase: string; reason: string };

const suggestionsSchema = z.object({
  keep: z.array(z.object({ phrase: z.string(), reason: z.string() })),
  skip: z.array(z.object({ phrase: z.string(), reason: z.string() })),
});

/**
 * Asks Claude to suggest title-filter phrases from the owner's profile facts
 * and target roles. Only phrases not already in the filter are returned; the
 * owner chooses which to add. Records the call's usage.
 *
 * @throws {@link ValidationError} when the model gives no usable answer.
 */
export async function suggestTitleFilter(
  db: Db,
  call: StructuredCall,
): Promise<{ keep: TitleSuggestion[]; skip: TitleSuggestion[] }> {
  const [facts, filter, { criteria }] = await Promise.all([listActiveFacts(db), getTitleFilter(db), getMatchCriteria(db)]);
  const system = `You help a job seeker set up a job-title filter. Discovery keeps a posting only if its title contains at
least one "keep" phrase and no "skip" phrase (whole words, case-insensitive).

Suggest up to 12 "keep" phrases that cover the titles this person would want (including common variants and
synonyms) and up to 10 "skip" phrases for titles they clearly wouldn't want. Phrases are 1-3 words, lowercase.
Base everything on the profile and target roles; give a short reason for each.

<profile>
${facts.map((f) => `- [${f.category}] ${f.fact}`).join("\n") || "- (no facts)"}
</profile>`;
  const user = `Target roles: ${criteria.roles.join(", ") || "(none set)"}
Current keep phrases: ${filter.include.join(", ") || "(none)"}
Current skip phrases: ${filter.exclude.join(", ") || "(none)"}

Suggest phrases that aren't already in the filter.`;

  const res = await call({ system, user, schema: suggestionsSchema, maxTokens: 4000, effort: "low" });
  await recordUsage(db, { purpose: "suggest_titles", model: res.model, usage: res.usage });
  if (!res.output) throw new ValidationError(`No suggestions came back (${res.error ?? "unknown error"}). Try again.`);

  const known = new Set([...filter.include, ...filter.exclude].map((p) => p.toLowerCase().trim()));
  const fresh = (items: TitleSuggestion[]) =>
    items
      .map((s) => ({ phrase: s.phrase.toLowerCase().trim(), reason: s.reason.trim() }))
      .filter((s) => s.phrase && !known.has(s.phrase))
      .slice(0, 12);
  return { keep: fresh(res.output.keep), skip: fresh(res.output.skip) };
}

/** Adds chosen phrases to the title filter (duplicates ignored). */
export async function addToTitleFilter(db: Db, keep: string[], skip: string[]): Promise<TitleFilter> {
  const current = await getTitleFilter(db);
  return saveTitleFilter(db, [...current.include, ...keep].join(", "), [...current.exclude, ...skip].join(", "));
}
