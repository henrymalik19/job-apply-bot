// Search criteria: what jobs the owner is looking for. Today that is the
// discovery pre-filters (job titles; work type, location and posting age);
// M4 adds roles, salary floor and dealbreakers (versioned in criteria_versions)
// for matching.
import type { Db } from "@/server/db/types";
import * as settings from "@/server/modules/settings/settings.service";
import {
  JOB_FILTER_KEY,
  jobFilterSchema,
  parseLocations,
  WORK_TYPES,
  type JobFilter,
  type WorkType,
} from "./job-filter";
import { parseKeywords, TITLE_FILTER_KEY, titleFilterSchema, type TitleFilter } from "./title-filter";

export {
  DEFAULT_MAX_AGE_DAYS,
  MAX_AGE_LIMIT_DAYS,
  passesJobFilter,
  WORK_TYPES,
  type JobFilter,
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
