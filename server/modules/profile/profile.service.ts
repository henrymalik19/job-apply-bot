// The owner's profile: contact details, work authorization, employment
// history (responsibilities and skills used), education, skills and
// certifications. Prompts read it through getProfileLines; everything in it
// counts as true and nothing beyond it may be claimed.
import { z } from "zod";
import type { Db } from "@/server/db/types";
import { ValidationError } from "@/server/core/errors";
import { normalize } from "@/shared/text";
import { profileLines, type ProfileLine } from "./profile-data";
import {
  deleteResponsibilities,
  deleteRow,
  deleteUserSkill,
  ensureSkills,
  hasEmployment,
  insertCertification,
  insertEducation,
  insertEmployment,
  insertResponsibilities,
  loadProfileData,
  resolveSkillId,
  setEmploymentSkills,
  updateEmployment,
  upsertProfile,
  upsertUserSkills,
  upsertWorkAuthorization,
} from "./profile.repository";

export * from "./profile-data";

/** Kinds of employment. */
export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "internship", "freelance"] as const;
/** Skill proficiency levels. */
export const PROFICIENCIES = ["expert", "advanced", "working", "familiar"] as const;

/** The catalog skill a name refers to (aliases first; new names join the catalog). */
export { resolveSkillId };

/** The whole profile, for the Profile page and workers. */
export const getProfile = loadProfileData;

/** The profile as prompt lines (what scoring, drafting and suggestions see). */
export async function getProfileLines(db: Db, now: Date = new Date()): Promise<ProfileLine[]> {
  return profileLines(await loadProfileData(db), now);
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid input.");
  return parsed.data;
}

const optionalText = (max = 300) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable().default(null));
const optionalUrl = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.string().trim().url("Enter a full URL starting with https://").nullable().default(null),
);
const yearOrNull = z.preprocess(
  (v) => (v === "" || v == null ? null : Number(v)),
  z.number().int().min(1950).max(2100).nullable(),
);
// <input type="month"> sends "2021-03"; stored as the 1st of the month.
const month = (message: string) => z.string().regex(/^\d{4}-\d{2}$/, message).transform((v) => `${v}-01`);
const lines = (v: unknown) => (typeof v === "string" ? v.split("\n").map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean) : []);
const list = (v: unknown) => (typeof v === "string" ? [...new Set(v.split(/[,\n]/).map((s) => s.trim()).filter(Boolean))] : []);

const profileInput = z.object({
  first_name: optionalText(100),
  last_name: optionalText(100),
  preferred_name: optionalText(100),
  email: z.preprocess((v) => (v === "" || v == null ? null : v), z.string().trim().email("Enter a valid email.").nullable().default(null)),
  phone: optionalText(40),
  city: optionalText(100),
  state: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim().toUpperCase() : null), z.string().regex(/^[A-Z]{2}$/, "Use the 2-letter state code.").nullable()),
  country: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim().toUpperCase() : "US"), z.string().regex(/^[A-Z]{2}$/, "Use the 2-letter country code.")),
  postal_code: optionalText(20),
  linkedin_url: optionalUrl,
  github_url: optionalUrl,
  website_url: optionalUrl,
  headline: optionalText(200),
  summary: optionalText(3000),
  notice_period: optionalText(100),
});

/** Saves the contact and summary section. @throws {@link ValidationError} */
export async function saveProfile(db: Db, userId: string, input: Record<string, unknown>): Promise<void> {
  await upsertProfile(db, userId, parse(profileInput, input));
}

const authorizationInput = z.object({
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Use the 2-letter country code (US, CA, GB)."),
  authorized: z.enum(["yes", "no"], { message: "Say whether you can work there." }).transform((v) => v === "yes"),
  requires_sponsorship: z.enum(["yes", "no"], { message: "Say whether you need sponsorship." }).transform((v) => v === "yes"),
  status: optionalText(100),
});

/** Adds or replaces the work authorization for one country. @throws {@link ValidationError} */
export async function saveWorkAuthorization(db: Db, input: Record<string, unknown>): Promise<void> {
  await upsertWorkAuthorization(db, parse(authorizationInput, input));
}

const employmentInput = z
  .object({
    employer: z.string().trim().min(1, "Enter the employer.").max(200),
    title: z.string().trim().min(1, "Enter the title.").max(200),
    location: optionalText(200),
    employment_type: z.preprocess((v) => (v === "" || v == null ? null : v), z.enum(EMPLOYMENT_TYPES).nullable()),
    start_date: month("Pick a start month."),
    end_date: z.preprocess((v) => (v === "" || v == null ? null : v), month("Pick an end month.").nullable()),
    is_current: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
    description: optionalText(500),
    responsibilities: z.preprocess(lines, z.array(z.string().max(600))),
    skills: z.preprocess(list, z.array(z.string().max(80))),
  })
  .refine((j) => !(j.is_current && j.end_date), { message: "A current job has no end month." })
  .refine((j) => !j.end_date || j.end_date >= j.start_date, { message: "The end month is before the start month." });

/**
 * Adds a job, or replaces one (with `id`): its fields, its responsibilities
 * (one per line) and the skills used (comma-separated; new ones join the
 * catalog and your skills).
 *
 * @throws {@link ValidationError}
 */
export async function saveEmployment(db: Db, input: Record<string, unknown>, id?: string): Promise<void> {
  const { responsibilities, skills, ...job } = parse(employmentInput, input);
  const employmentId = id ? (await updateEmployment(db, z.string().uuid().parse(id), job), id) : await insertEmployment(db, job);
  if (id) await deleteResponsibilities(db, employmentId);
  await insertResponsibilities(db, responsibilities.map((text, i) => ({ employment_id: employmentId, text, sort_order: i })));
  const skillIds = await ensureSkills(db, skills);
  await setEmploymentSkills(db, employmentId, [...skillIds.values()]);
  await upsertUserSkills(db, [...skillIds.values()].map((skill_id) => ({ skill_id })), true);
}

const educationInput = z.object({
  institution: z.string().trim().min(1, "Enter the school.").max(200),
  degree: optionalText(100),
  field_of_study: optionalText(200),
  start_year: yearOrNull,
  end_year: yearOrNull,
  completed: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});

/** Adds an education entry. @throws {@link ValidationError} */
export async function addEducation(db: Db, input: Record<string, unknown>): Promise<void> {
  await insertEducation(db, parse(educationInput, input));
}

const certificationInput = z.object({
  name: z.string().trim().min(1, "Enter the certification.").max(200),
  issuer: optionalText(200),
  issued_on: z.preprocess((v) => (v === "" || v == null ? null : v), month("Pick the month issued.").nullable()),
  expires_on: z.preprocess((v) => (v === "" || v == null ? null : v), month("Pick the expiry month.").nullable()),
  credential_url: optionalUrl,
});

/** Adds a certification. @throws {@link ValidationError} */
export async function addCertification(db: Db, input: Record<string, unknown>): Promise<void> {
  await insertCertification(db, parse(certificationInput, input));
}

/** Adds skills you have (comma-separated names). @throws {@link ValidationError} */
export async function addSkills(db: Db, names: unknown): Promise<number> {
  const skills = list(names);
  if (skills.length === 0) throw new ValidationError("Enter at least one skill.");
  const ids = await ensureSkills(db, skills);
  await upsertUserSkills(db, [...ids.values()].map((skill_id) => ({ skill_id })), true);
  return ids.size;
}

const skillInput = z.object({
  years_override: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().min(0).max(60).nullable()),
  proficiency: z.preprocess((v) => (v === "" || v == null ? null : v), z.enum(PROFICIENCIES).nullable()),
});

/** Sets a skill's years override and proficiency. @throws {@link ValidationError} */
export async function updateSkill(db: Db, skillId: string, input: Record<string, unknown>): Promise<void> {
  await upsertUserSkills(db, [{ skill_id: z.string().uuid().parse(skillId), ...parse(skillInput, input) }]);
}

/** Removes a skill from your list (it stays in the catalog and on jobs that used it). */
export async function removeSkill(db: Db, skillId: string): Promise<void> {
  await deleteUserSkill(db, z.string().uuid().parse(skillId));
}

/** Deletes one row from a profile list. */
export async function removeProfileItem(
  db: Db,
  kind: "work_authorizations" | "employments" | "educations" | "certifications",
  id: string,
): Promise<void> {
  await deleteRow(db, kind, z.string().uuid().parse(id));
}

/** A profile to import (from the old app's export). */
export type ProfileImport = {
  profile: Record<string, unknown>;
  workAuthorizations: Record<string, unknown>[];
  employment: Record<string, unknown>[];
  education: Record<string, unknown>[];
  skills: { name: string; years: number | null }[];
};

/**
 * Imports a profile unless employment history already exists. Each part goes
 * through the same validation as the Profile page forms.
 *
 * @returns Whether anything was imported.
 */
export async function importProfile(db: Db, userId: string, data: ProfileImport): Promise<boolean> {
  if (await hasEmployment(db)) return false;
  await saveProfile(db, userId, data.profile);
  for (const a of data.workAuthorizations) await saveWorkAuthorization(db, a);
  for (const job of data.employment) await saveEmployment(db, job);
  for (const e of data.education) await addEducation(db, e);
  const ids = await ensureSkills(db, data.skills.map((s) => s.name));
  await upsertUserSkills(
    db,
    data.skills.map((s, i) => ({ skill_id: ids.get(normalize(s.name))!, years_override: s.years, sort_order: i })).filter((s) => s.skill_id),
  );
  return true;
}

/** Profile fields a form answer can be saved back to (by catalog question key). */
export const PROFILE_ANSWER_KEYS = [
  "first_name", "last_name", "full_name", "preferred_name", "email", "phone", "postal_code",
  "linkedin_url", "github_url", "website_url", "notice_period", "current_location",
] as const;

/**
 * Saves one answer back to the profile: a single column, or "full_name"
 * (first + last) and "current_location" ("City, ST").
 *
 * @returns Whether the key is one the profile holds (otherwise nothing is saved).
 * @throws {@link ValidationError} for an invalid email, URL or location.
 */
export async function saveProfileAnswer(db: Db, userId: string, key: string, value: string): Promise<boolean> {
  if (!(PROFILE_ANSWER_KEYS as readonly string[]).includes(key)) return false;
  const text = value.trim();
  if (key === "full_name") {
    const [first, ...rest] = text.split(/\s+/);
    await upsertProfile(db, userId, { first_name: first || null, last_name: rest.join(" ") || null });
  } else if (key === "current_location") {
    const m = /^(.+?),\s*([A-Za-z]{2})$/.exec(text);
    if (!m) throw new ValidationError('Write the location as "City, ST" to save it to your profile.');
    await upsertProfile(db, userId, { city: m[1].trim(), state: m[2].toUpperCase() });
  } else {
    const field = profileInput.shape[key as keyof typeof profileInput.shape];
    await upsertProfile(db, userId, { [key]: parse(field as z.ZodType<string | null>, text) });
  }
  return true;
}
