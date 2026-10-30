"use server";

import { refresh } from "next/cache";
import { ownerContext } from "@/server/auth/require-owner";
import { ValidationError } from "@/server/core/errors";
import type { Db } from "@/server/db/types";
import {
  addCertification,
  addEducation,
  addSkills,
  removeProfileItem,
  removeSkill,
  saveEmployment,
  saveProfile,
  saveWorkAuthorization,
  updateSkill,
} from "@/server/modules/profile/profile.service";
import type { FormMessageState } from "../../_components/form-message";

const values = (formData: FormData) => Object.fromEntries([...formData.entries()].map(([k, v]) => [k, String(v)]));

/** Runs a save as the owner, turning validation errors into a form message. */
async function run(ok: string, save: (db: Db, userId: string) => Promise<unknown>): Promise<FormMessageState> {
  const { db, owner } = await ownerContext();
  try {
    await save(db, owner.id);
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  refresh();
  return { ok };
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
  refresh();
}

/** Removes a skill from your list. */
export async function removeSkillAction(formData: FormData) {
  const { db, owner } = await ownerContext();
  await removeSkill(db, owner.id, String(formData.get("skill_id")));
  refresh();
}
