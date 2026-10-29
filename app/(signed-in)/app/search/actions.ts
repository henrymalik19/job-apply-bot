"use server";

import { refresh } from "next/cache";
import { ownerContext } from "@/server/auth/require-owner";
import { ValidationError } from "@/server/core/errors";
import { createClaudeCaller } from "@/server/integrations/anthropic/claude";
import {
  addToTitleFilter,
  saveJobFilter,
  saveMatchCriteria,
  saveTitleFilter,
  suggestTitleFilter,
  type TitleSuggestion,
} from "@/server/modules/criteria/criteria.service";
import { pruneSavedJobs } from "@/server/modules/discovery/discovery.service";
import type { FormMessageState } from "../../_components/form-message";

/** Title-filter form action. */
export async function saveTitleFilterAction(_prev: FormMessageState, formData: FormData): Promise<FormMessageState> {
  const { db } = await ownerContext();
  await saveTitleFilter(db, String(formData.get("include") ?? ""), String(formData.get("exclude") ?? ""));
  refresh();
  return { ok: "Saved. Applies to jobs found from the next discovery run on." };
}

/** Work-type, location and age form action. */
export async function saveJobFilterAction(_prev: FormMessageState, formData: FormData): Promise<FormMessageState> {
  const { db } = await ownerContext();
  const saved = await saveJobFilter(db, {
    workTypes: formData.getAll("workTypes").map(String),
    locations: String(formData.get("locations") ?? ""),
    keepUnknownWorkType: formData.get("keepUnknownWorkType") === "on",
    keepRemoteWithoutLocation: formData.get("keepRemoteWithoutLocation") === "on",
    maxAgeDays: String(formData.get("maxAgeDays") ?? ""),
  });
  refresh();
  return { ok: `Saved (posted within ${saved.max_age_days} days). Applies from the next discovery run on.` };
}

/** Removes saved jobs that no longer match the filters (jobs with applications are kept). */
export async function pruneSavedJobsAction(): Promise<FormMessageState> {
  const { db } = await ownerContext();
  const result = await pruneSavedJobs(db, new Date());
  refresh();
  return {
    ok: `Checked ${result.checked.toLocaleString()} saved jobs: removed ${result.removed.toLocaleString()}, kept ${result.kept.toLocaleString()}.`,
  };
}

/** Matching-criteria form action. A change creates a new criteria version (jobs are rescored). */
export async function saveMatchCriteriaAction(_prev: FormMessageState, formData: FormData): Promise<FormMessageState> {
  const { db } = await ownerContext();
  const field = (name: string) => String(formData.get(name) ?? "");
  const saved = await saveMatchCriteria(db, {
    roles: field("roles"),
    seniority: formData.getAll("seniority").map(String),
    minSalary: field("minSalary"),
    dealbreakers: field("dealbreakers"),
    excludedCompanies: field("excludedCompanies"),
    threshold: field("threshold"),
    notes: field("notes"),
  });
  refresh();
  return {
    ok: saved.created
      ? "Saved as a new criteria version. Jobs are rescored on the next matching run."
      : "No changes to save.",
  };
}

/** State of the title-suggestions panel. */
export type SuggestState = FormMessageState & { keep?: TitleSuggestion[]; skip?: TitleSuggestion[] };

/** Asks Claude for title phrases based on the profile. */
export async function suggestTitlesAction(): Promise<SuggestState> {
  const { db } = await ownerContext();
  if (!process.env.ANTHROPIC_API_KEY) {
    return { error: "Suggestions need ANTHROPIC_API_KEY in the app's environment (Vercel)." };
  }
  try {
    const suggestions = await suggestTitleFilter(db, createClaudeCaller());
    if (!suggestions.keep.length && !suggestions.skip.length) return { ok: "No new phrases to suggest." };
    return suggestions;
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
}

/** Adds the ticked suggestions to the title filter. */
export async function addSuggestionsAction(_prev: FormMessageState, formData: FormData): Promise<FormMessageState> {
  const { db } = await ownerContext();
  const keep = formData.getAll("keep").map(String);
  const skip = formData.getAll("skip").map(String);
  if (!keep.length && !skip.length) return { error: "Tick at least one phrase." };
  await addToTitleFilter(db, keep, skip);
  refresh();
  return { ok: `Added ${keep.length + skip.length} phrase(s) to the title filter.` };
}
