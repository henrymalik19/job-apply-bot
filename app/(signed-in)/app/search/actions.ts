"use server";

import { refresh } from "next/cache";
import { ownerContext } from "@/server/auth/require-owner";
import { saveJobFilter, saveTitleFilter } from "@/server/modules/criteria/criteria.service";
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
