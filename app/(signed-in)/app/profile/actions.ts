"use server";

import { refresh } from "next/cache";
import { ownerContext } from "@/server/auth/require-owner";
import { ValidationError } from "@/server/core/errors";
import type { Db } from "@/server/db/types";
import { createClaudeCaller } from "@/server/integrations/anthropic/claude";
import {
  addCertification,
  addEducation,
  addSkills,
  mergeSkills,
  removeProfileItem,
  removeSkill,
  saveEmployment,
  saveProfile,
  saveWorkAuthorization,
  suggestSkillCleanup,
  updateSkill,
  type NotASkillSuggestion,
  type SkillMergeSuggestion,
} from "@/server/modules/profile/profile.service";
import { deleteSavedAnswer, updateSavedAnswer } from "@/server/modules/questions/saved-answers";
import { PROFILE_CHANGED_KEY, recheckOpenQuestions } from "@/server/modules/prepare/prepare.service";
import { putUserSetting } from "@/server/modules/settings/settings.service";
import type { FormMessageState } from "../../_components/form-message";

const values = (formData: FormData) => Object.fromEntries([...formData.entries()].map(([k, v]) => [k, String(v)]));

/**
 * Runs a save as the owner, turning validation errors into a form message. Then your waiting
 * applications' answers that come from your profile and saved answers are brought up to date (no Claude).
 */
async function run(ok: string, save: (db: Db, userId: string) => Promise<unknown>): Promise<FormMessageState> {
  const { db, owner } = await ownerContext();
  try {
    await save(db, owner.id);
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  // Resumes made before now are out of date (the application page offers to rebuild them).
  await putUserSetting(db, owner.id, PROFILE_CHANGED_KEY, new Date().toISOString()).catch(() => undefined);
  const { refreshed, answered } = await recheckOpenQuestions({ db, userId: owner.id }).catch(() => ({ refreshed: 0, answered: 0 }));
  refresh();
  const updated = refreshed + answered;
  return { ok: updated ? `${ok} Updated ${updated} ${updated === 1 ? "answer" : "answers"} on your waiting applications.` : ok };
}

/** Saves contact details and summary. */
export async function saveProfileAction(_prev: FormMessageState, formData: FormData): Promise<FormMessageState> {
  return run("Saved.", (db, userId) => saveProfile(db, userId, values(formData)));
}

/** Adds or replaces the work authorization for a country. */
export async function saveAuthorizationAction(_prev: FormMessageState, formData: FormData): Promise<FormMessageState> {
  return run("Saved.", (db, userId) => saveWorkAuthorization(db, userId, values(formData)));
}

/** Adds a job, or saves an edited one (with `id`). */
export async function saveEmploymentAction(_prev: FormMessageState, formData: FormData): Promise<FormMessageState> {
  const { id, ...rest } = values(formData);
  return run(id ? "Saved." : "Added.", (db, userId) => saveEmployment(db, userId, rest, id || undefined));
}

/** Adds an education entry. */
export async function addEducationAction(_prev: FormMessageState, formData: FormData): Promise<FormMessageState> {
  return run("Added.", (db, userId) => addEducation(db, userId, values(formData)));
}

/** Adds a certification. */
export async function addCertificationAction(_prev: FormMessageState, formData: FormData): Promise<FormMessageState> {
  return run("Added.", (db, userId) => addCertification(db, userId, values(formData)));
}

/** Adds skills (comma-separated). */
export async function addSkillsAction(_prev: FormMessageState, formData: FormData): Promise<FormMessageState> {
  return run("Added.", (db, userId) => addSkills(db, userId, formData.get("names")));
}

/** Saves a skill's years override and proficiency. */
export async function updateSkillAction(_prev: FormMessageState, formData: FormData): Promise<FormMessageState> {
  const { skill_id, ...rest } = values(formData);
  return run("Saved.", (db, userId) => updateSkill(db, userId, skill_id, rest));
}

const REMOVABLE = ["work_authorizations", "employments", "educations", "certifications"] as const;

/** Deletes one profile item (`kind` + `id`). */
export async function removeItemAction(formData: FormData) {
  const kind = String(formData.get("kind"));
  if (!(REMOVABLE as readonly string[]).includes(kind)) throw new Error(`cannot remove ${kind}`);
  const { db, owner } = await ownerContext();
  await removeProfileItem(db, owner.id, kind as (typeof REMOVABLE)[number], String(formData.get("id")));
  await putUserSetting(db, owner.id, PROFILE_CHANGED_KEY, new Date().toISOString()).catch(() => undefined);
  refresh();
}

/** Removes a skill from your list; `from_jobs=on` also unlinks it from your jobs. */
export async function removeSkillAction(formData: FormData) {
  const { db, owner } = await ownerContext();
  await removeSkill(db, owner.id, String(formData.get("skill_id")), { fromJobs: formData.get("from_jobs") === "on" });
  await putUserSetting(db, owner.id, PROFILE_CHANGED_KEY, new Date().toISOString()).catch(() => undefined);
  refresh();
}

/** Merges skills (`merge_id`, repeatable) into `keep_id`. */
export async function mergeSkillsAction(_prev: FormMessageState, formData: FormData): Promise<FormMessageState> {
  const merge = formData.getAll("merge_id").map(String).filter(Boolean);
  return run("Merged.", (db, userId) => mergeSkills(db, userId, String(formData.get("keep_id")), merge));
}

/** Cleanup suggestions, or a message. */
export type CleanupState = FormMessageState & { merges?: SkillMergeSuggestion[]; notSkills?: NotASkillSuggestion[] };

/** "Find duplicates": Claude suggests merges and entries that aren't skills. */
export async function suggestSkillCleanupAction(): Promise<CleanupState> {
  const { db, owner } = await ownerContext();
  if (!process.env.ANTHROPIC_API_KEY) return { error: "This needs ANTHROPIC_API_KEY in the app's environment (Vercel)." };
  try {
    const result = await suggestSkillCleanup(db, owner.id, createClaudeCaller());
    if (!result.merges.length && !result.notSkills.length) return { ok: "Your skill list looks clean: no duplicates found." };
    return result;
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
}

/** The answer a saved-answer form sent: `answer`, or a range's `answer_min` and `answer_max`. */
function savedAnswerText(formData: FormData): string {
  if (!formData.has("answer_min")) return String(formData.get("answer") ?? "");
  const [min, max] = [String(formData.get("answer_min") ?? "").trim(), String(formData.get("answer_max") ?? "").trim()];
  return min && max ? `${min}-${max}` : min || max;
}

/** Changes one saved answer (`question_id`, and `answer` or a range's `answer_min`/`answer_max`). */
export async function saveSavedAnswerAction(_prev: FormMessageState, formData: FormData): Promise<FormMessageState> {
  return run("Saved; the next form that asks uses it.", (db, userId) =>
    updateSavedAnswer(db, userId, String(formData.get("question_id")), savedAnswerText(formData)),
  );
}

/** Deletes one saved answer (`question_id`). */
export async function deleteSavedAnswerAction(formData: FormData) {
  const { db, owner } = await ownerContext();
  await deleteSavedAnswer(db, owner.id, String(formData.get("question_id")));
  refresh();
}
