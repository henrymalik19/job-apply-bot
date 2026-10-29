import { z } from "zod";
import { normalize } from "@/shared/text";
import { placeMatches, resolvePlace, resolveWanted, type WantedPlace } from "./places";

/** Words that describe remoteness rather than a place. */
const REMOTE_WORDS =
  /\b(remote|anywhere|worldwide|global|globally|distributed|work from home|wfh|fully|first|friendly|only|or|and|position|opportunity|location|locations|flexible)\b/g;

/** Work arrangements a job can have (`jobs.remote_type` minus "unknown"). */
export const WORK_TYPES = ["remote", "hybrid", "onsite"] as const;
/** One work arrangement. */
export type WorkType = (typeof WORK_TYPES)[number];

/** Hard cap on posting age: discovery never saves a job posted longer ago than this. */
export const MAX_AGE_LIMIT_DAYS = 90;
/** Default posting age limit. */
export const DEFAULT_MAX_AGE_DAYS = 30;

/**
 * Shape of `settings.discover_job_filter`: which work types and locations to
 * keep and how old a posting may be, applied by discovery before saving.
 */
export const jobFilterSchema = z.object({
  /** Work types to keep; empty keeps all. */
  work_types: z.array(z.enum(WORK_TYPES)).default([]),
  /** Location phrases to keep (any listed location matching any phrase); empty keeps all. */
  locations: z.array(z.string()).default([]),
  /** Keep jobs whose work type isn't stated (most Greenhouse postings). */
  keep_unknown_work_type: z.boolean().default(true),
  /** Keep remote jobs that list no matching location (e.g. just "Remote"). */
  keep_remote_without_location: z.boolean().default(true),
  /** Skip jobs posted more than this many days ago (1–90). Jobs with no posting date are kept. */
  max_age_days: z.number().int().min(1).max(MAX_AGE_LIMIT_DAYS).catch(DEFAULT_MAX_AGE_DAYS).default(DEFAULT_MAX_AGE_DAYS),
});

/** Work-type, location and age rules for discovery. */
export type JobFilter = z.infer<typeof jobFilterSchema>;

/** The settings key that stores the {@link JobFilter}. */
export const JOB_FILTER_KEY = "discover_job_filter";

/** Minimal job shape the filter needs. */
export type FilterableJob = { remote_type: string; locations: string[]; posted_at: string | null };

/**
 * Whether a job passes the work-type, location and age rules. Locations are
 * resolved to places, so "US" keeps "Houston, TX", "Texas" keeps "Austin" and
 * "NYC" keeps "New York, NY"; unrecognized phrases match as whole words.
 */
export function passesJobFilter(job: FilterableJob, filter: JobFilter, now: Date): boolean {
  if (job.posted_at) {
    const ageDays = (now.getTime() - new Date(job.posted_at).getTime()) / 86_400_000;
    if (ageDays > filter.max_age_days) return false;
  }

  const type = job.remote_type;
  if (filter.work_types.length > 0) {
    const known = (WORK_TYPES as readonly string[]).includes(type);
    if (known ? !filter.work_types.includes(type as WorkType) : !filter.keep_unknown_work_type) return false;
  }

  if (filter.locations.length === 0) return true;
  const wanted = filter.locations.map(resolveWanted).filter((w): w is WantedPlace => w !== null);
  const places = job.locations.map((raw) => ({ raw, place: resolvePlace(raw) }));
  if (places.some(({ raw, place }) => wanted.some((w) => placeMatches(place, raw, w)))) return true;
  // A remote job whose locations are only remote-ish words ("Remote", "Anywhere",
  // "Global Remote") names no place and is kept if allowed. Any other word, even
  // a place we don't recognize ("Vietnam"), counts as naming a place.
  const namesNoPlace = job.locations.every((raw) => normalize(raw).replace(REMOTE_WORDS, "").trim() === "");
  return type === "remote" && filter.keep_remote_without_location && namesNoPlace;
}

/** Splits a comma- or newline-separated phrase list, trimming and removing blanks and duplicates. */
export function parseLocations(input: string): string[] {
  return [...new Set(input.split(/[,\n;]/).map((s) => s.trim()).filter(Boolean))];
}
