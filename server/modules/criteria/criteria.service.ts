// Search criteria: what jobs the owner is looking for. Today that is the title
// pre-filter applied during discovery; M4 adds roles, location/remote, salary
// floor and dealbreakers (versioned in criteria_versions) for matching.
import type { Db } from "@/server/db/types";
import * as settings from "@/server/modules/settings/settings.service";
import { parseKeywords, TITLE_FILTER_KEY, titleFilterSchema, type TitleFilter } from "./title-filter";

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
