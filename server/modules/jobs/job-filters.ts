import { z } from "zod";

/** Remote filter values (match `jobs.remote_type`), plus "any". */
export const REMOTE_OPTIONS = ["any", "remote", "hybrid", "onsite", "unknown"] as const;
/** Which jobs to show by open/closed state. */
export const STATE_OPTIONS = ["open", "closed", "all"] as const;
/** How recently a job was first found, in days ("any" = no limit). */
export const FOUND_OPTIONS = ["any", "1", "7", "30"] as const;
/** How recently a job was posted, in days ("any" = no limit). Discovery never saves jobs older than 90 days. */
export const POSTED_OPTIONS = ["7", "30", "90", "any"] as const;
/** Sort orders: newest found, newest posted, or best match score. */
export const SORT_OPTIONS = ["found", "posted", "score"] as const;
/**
 * Match filter: "relevant" (everything not ruled out by a hard filter), "matched"
 * (scored at or above the threshold), "ruled_out", or "all".
 */
export const MATCH_OPTIONS = ["relevant", "matched", "ruled_out", "all"] as const;

const oneOf = <T extends readonly [string, ...string[]]>(values: T, fallback: T[number]) =>
  z.preprocess((v) => (Array.isArray(v) ? v[0] : v), z.enum(values).catch(fallback as never)).default(fallback as never);

const filtersSchema = z.object({
  q: z
    .preprocess((v) => (Array.isArray(v) ? v[0] : v), z.string().optional())
    // PostgREST's `or()` syntax treats , ( ) as separators and % _ as wildcards.
    .transform((v) => (v ?? "").replace(/[,()%_*\\"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100)),
  remote: oneOf(REMOTE_OPTIONS, "any"),
  state: oneOf(STATE_OPTIONS, "open"),
  found: oneOf(FOUND_OPTIONS, "any"),
  posted: oneOf(POSTED_OPTIONS, "30"),
  sort: oneOf(SORT_OPTIONS, "found"),
  match: oneOf(MATCH_OPTIONS, "relevant"),
});

/** Jobs-page filters, parsed from the URL with safe defaults. */
export type JobFilters = z.infer<typeof filtersSchema>;

/**
 * Parses Jobs-page filters from search params. Unknown or invalid values fall
 * back to defaults (open jobs posted in the last 30 days, any remote type,
 * newest found first),
 * and the text query is stripped of characters that would break the query.
 */
export function parseJobFilters(params: Record<string, string | string[] | undefined>): JobFilters {
  return filtersSchema.parse(params);
}

/**
 * The non-default filters as search params, for links that must keep them
 * (pager, detail back-link). Defaults are omitted to keep URLs short.
 */
export function filtersToParams(filters: JobFilters): Record<string, string> {
  const defaults = filtersSchema.parse({});
  return Object.fromEntries(
    Object.entries(filters).filter(([k, v]) => v !== "" && v !== defaults[k as keyof JobFilters]),
  ) as Record<string, string>;
}
