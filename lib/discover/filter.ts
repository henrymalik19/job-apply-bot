import { z } from "zod";
import { normalize } from "./text";

// settings.discover_filter: cheap title pre-filter applied before inserting jobs.
export const titleFilterSchema = z.object({
  include: z.array(z.string()).default([]),
  exclude: z.array(z.string()).default([]),
});
export type TitleFilter = z.infer<typeof titleFilterSchema>;

const hasPhrase = (title: string, phrase: string) => {
  const p = normalize(phrase);
  return p.length > 0 && ` ${title} `.includes(` ${p} `);
};

// Whole-word, case- and punctuation-insensitive. Empty include keeps everything.
export function passesTitleFilter(title: string, filter: TitleFilter): boolean {
  const t = normalize(title);
  const included = filter.include.length === 0 || filter.include.some((k) => hasPhrase(t, k));
  return included && !filter.exclude.some((k) => hasPhrase(t, k));
}

export function parseKeywords(input: string): string[] {
  return [...new Set(input.split(/[,\n]/).map((s) => s.trim()).filter(Boolean))];
}
