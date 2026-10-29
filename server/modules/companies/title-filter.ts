import { z } from "zod";
import { normalize } from "@/shared/text";

/** Shape of `settings.discover_filter`: the cheap title pre-filter applied before jobs are saved. */
export const titleFilterSchema = z.object({
  include: z.array(z.string()).default([]),
  exclude: z.array(z.string()).default([]),
});

/** Keep/skip phrases for job titles. */
export type TitleFilter = z.infer<typeof titleFilterSchema>;

/** The settings key that stores the {@link TitleFilter}. */
export const TITLE_FILTER_KEY = "discover_filter";

const hasPhrase = (title: string, phrase: string) => {
  const p = normalize(phrase);
  return p.length > 0 && ` ${title} `.includes(` ${p} `);
};

/**
 * Whether a job title passes the filter. Matching is whole-word and ignores
 * case and punctuation; an empty include list keeps everything, and exclude
 * always wins over include.
 */
export function passesTitleFilter(title: string, filter: TitleFilter): boolean {
  const t = normalize(title);
  const included = filter.include.length === 0 || filter.include.some((k) => hasPhrase(t, k));
  return included && !filter.exclude.some((k) => hasPhrase(t, k));
}

/** Splits a comma- or newline-separated phrase list, trimming and removing blanks and duplicates. */
export function parseKeywords(input: string): string[] {
  return [...new Set(input.split(/[,\n]/).map((s) => s.trim()).filter(Boolean))];
}
