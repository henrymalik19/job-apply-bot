"use server";

import { refresh } from "next/cache";
import { ownerContext } from "@/server/auth/require-owner";
import { ValidationError } from "@/server/core/errors";
import type { Db } from "@/server/db/types";
import {
  addCertification,
  addEducation,
  addFact,
  addSkills,
  editFact,
  removeProfileItem,
  removeSkill,
  saveEmployment,
  saveProfile,
  saveWorkAuthorization,
  setFactActive,
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
  return run("Saved.", (db) => saveWorkAuthorization(db, values(formData)));
}

/** Adds a job, or saves an edited one (with `id`). */
export async function saveEmploymentAction(_prev: FormMessageState, formData: FormData): Promise<FormMessageState> {
  const { id, ...rest } = values(formData);
  return run(id ? "Saved." : "Added.", (db) => saveEmployment(db, rest, id || undefined));
}

/** Adds an education entry. */
export async function addEducationAction(_prev: FormMessageState, formData: FormData): Promise<FormMessageState> {
  return run("Added.", (db) => addEducation(db, values(formData)));
}

/** Adds a certification. */
export async function addCertificationAction(_prev: FormMessageState, formData: FormData): Promise<FormMessageState> {
  return run("Added.", (db) => addCertification(db, values(formData)));
}

/** Adds skills (comma-separated). */
export async function addSkillsAction(_prev: FormMessageState, formData: FormData): Promise<FormMessageState> {
  return run("Added.", (db) => addSkills(db, formData.get("names")));
}

/** Saves a skill's years override and proficiency. */
export async function updateSkillAction(_prev: FormMessageState, formData: FormData): Promise<FormMessageState> {
  const { skill_id, ...rest } = values(formData);
  return run("Saved.", (db) => updateSkill(db, skill_id, rest));
}

/** Adds a free-form fact. */
export async function addFactAction(_prev: FormMessageState, formData: FormData): Promise<FormMessageState> {
  return run("Added.", (db) => addFact(db, { category: formData.get("category"), fact: formData.get("fact") }));
}

/** Saves an edited fact. */
export async function editFactAction(_prev: FormMessageState, formData: FormData): Promise<FormMessageState> {
  return run("Saved.", (db) => editFact(db, String(formData.get("id")), String(formData.get("fact") ?? "")));
}

const REMOVABLE = ["work_authorizations", "employments", "educations", "certifications", "confirmed_facts"] as const;

/** Deletes one profile item (`kind` + `id`). */
export async function removeItemAction(formData: FormData) {
  const kind = String(formData.get("kind"));
  if (!(REMOVABLE as readonly string[]).includes(kind)) throw new Error(`cannot remove ${kind}`);
  const { db } = await ownerContext();
  await removeProfileItem(db, kind as (typeof REMOVABLE)[number], String(formData.get("id")));
  refresh();
}

/** Removes a skill from your list. */
export async function removeSkillAction(formData: FormData) {
  const { db } = await ownerContext();
  await removeSkill(db, String(formData.get("skill_id")));
  refresh();
}

/** Turns a fact on or off. */
export async function toggleFactAction(formData: FormData) {
  const { db } = await ownerContext();
  await setFactActive(db, String(formData.get("id")), formData.get("active") === "true");
  refresh();
}
