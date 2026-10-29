import type { Db, Insert, Row, Update } from "@/server/db/types";
import { check, unwrap } from "@/server/core/errors";
import { normalize } from "@/shared/text";
import type { Employment, ProfileData, UserSkill } from "./profile-data";

/** Loads the whole profile in parallel queries. */
export async function loadProfileData(db: Db): Promise<ProfileData> {
  const [profile, auths, jobs, education, skills, certifications, facts] = await Promise.all([
    db.from("profiles").select("*").limit(1).maybeSingle(),
    db.from("work_authorizations").select("*").order("country"),
    db
      .from("employments")
      .select("*, employment_responsibilities(*), employment_skills(skills(name))")
      .order("is_current", { ascending: false })
      .order("start_date", { ascending: false }),
    db.from("educations").select("*").order("sort_order").order("end_year", { ascending: false, nullsFirst: true }),
    db.from("profile_skills").select("*, skills(name, normalized, category)").order("sort_order").order("created_at"),
    db.from("certifications").select("*").order("sort_order").order("issued_on", { ascending: false }),
    db.from("profile_facts").select("*").eq("active", true).order("category").order("sort_order"),
  ]);
  type JobRow = Row<"employments"> & {
    employment_responsibilities: Row<"employment_responsibilities">[];
    employment_skills: { skills: { name: string } | null }[];
  };
  const employment: Employment[] = (unwrap(jobs, "load employment") as unknown as JobRow[]).map(
    ({ employment_responsibilities, employment_skills, ...job }) => ({
      ...job,
      responsibilities: [...employment_responsibilities].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
      skills: employment_skills.map((s) => s.skills?.name).filter((n): n is string => Boolean(n)).sort(),
    }),
  );
  type SkillRow = Row<"profile_skills"> & { skills: Pick<Row<"skills">, "name" | "normalized" | "category"> };
  const userSkills: UserSkill[] = (unwrap(skills, "load skills") as unknown as SkillRow[]).map(({ skills: s, ...us }) => ({ ...us, ...s }));
  if (profile.error) unwrap(profile, "load profile");
  return {
    profile: profile.data ?? emptyProfile(),
    workAuthorizations: unwrap(auths, "load work authorizations"),
    employment,
    education: unwrap(education, "load education"),
    skills: userSkills,
    certifications: unwrap(certifications, "load certifications"),
    facts: unwrap(facts, "load facts"),
  };
}

function emptyProfile(): Row<"profiles"> {
  return {
    user_id: "", first_name: null, last_name: null, preferred_name: null, email: null, phone: null, city: null, state: null,
    country: "US", postal_code: null, linkedin_url: null, github_url: null, website_url: null, headline: null, summary: null,
    notice_period: null, created_at: new Date(0).toISOString(), updated_at: new Date(0).toISOString(),
  };
}

/** Creates or updates a user's profile row. */
export async function upsertProfile(db: Db, userId: string, changes: Omit<Insert<"profiles">, "user_id">): Promise<void> {
  check(await db.from("profiles").upsert({ ...changes, user_id: userId }), "save profile");
}

/** Creates or replaces the authorization row for a country. */
export async function upsertWorkAuthorization(db: Db, row: Insert<"work_authorizations">): Promise<void> {
  check(await db.from("work_authorizations").upsert(row, { onConflict: "country" }), "save work authorization");
}

/** Generic delete by id for the profile's list tables. */
export async function deleteRow(
  db: Db,
  table: "work_authorizations" | "employments" | "educations" | "certifications" | "profile_facts",
  id: string,
): Promise<void> {
  check(await db.from(table).delete().eq("id", id), `delete from ${table}`);
}

/** Adds a job and returns its id. */
export async function insertEmployment(db: Db, row: Insert<"employments">): Promise<string> {
  return unwrap(await db.from("employments").insert(row).select("id").single(), "add job").id;
}

/** Updates a job. */
export async function updateEmployment(db: Db, id: string, changes: Update<"employments">): Promise<void> {
  check(await db.from("employments").update(changes).eq("id", id), "update job");
}

/** Adds responsibilities to a job. */
export async function insertResponsibilities(db: Db, rows: Insert<"employment_responsibilities">[]): Promise<void> {
  if (rows.length) check(await db.from("employment_responsibilities").insert(rows), "add responsibilities");
}

/** Rewrites one responsibility. */
export async function updateResponsibility(db: Db, id: string, text: string): Promise<void> {
  check(await db.from("employment_responsibilities").update({ text }).eq("id", id), "update responsibility");
}

/**
 * Finds or creates catalog skills by name (case- and punctuation-insensitive)
 * and returns their ids by normalized name.
 */
export async function ensureSkills(db: Db, names: string[]): Promise<Map<string, string>> {
  const unique = new Map(names.map((n) => [normalize(n), n.trim()] as const).filter(([k]) => k));
  if (unique.size === 0) return new Map();
  const rows = [...unique].map(([normalized, name]) => ({ name, normalized }));
  check(await db.from("skills").upsert(rows, { onConflict: "normalized", ignoreDuplicates: true }), "add skills");
  const found = unwrap(await db.from("skills").select("id, normalized").in("normalized", [...unique.keys()]), "read skills");
  return new Map(found.map((s) => [s.normalized, s.id]));
}

/**
 * The catalog skill a name refers to: an alias ("k8s" → Kubernetes) first,
 * then the skill's own name; a name never seen before is added to the catalog.
 */
export async function resolveSkillId(db: Db, name: string): Promise<string | null> {
  const key = normalize(name);
  if (!key) return null;
  const alias = await db.from("skill_aliases").select("skill_id").eq("alias", key).maybeSingle();
  if (alias.error) unwrap(alias, "resolve skill alias");
  if (alias.data) return alias.data.skill_id;
  return (await ensureSkills(db, [name])).get(key) ?? null;
}

/** Replaces the skills used at a job. */
export async function setEmploymentSkills(db: Db, employmentId: string, skillIds: string[]): Promise<void> {
  check(await db.from("employment_skills").delete().eq("employment_id", employmentId), "clear job skills");
  if (skillIds.length) {
    check(await db.from("employment_skills").insert(skillIds.map((skill_id) => ({ employment_id: employmentId, skill_id }))), "set job skills");
  }
}

/**
 * Adds or updates skills the owner has.
 *
 * @param keepExisting - Only add missing skills; leave existing rows (and their overrides) as they are.
 */
export async function upsertUserSkills(db: Db, rows: Insert<"profile_skills">[], keepExisting = false): Promise<void> {
  if (rows.length) {
    check(await db.from("profile_skills").upsert(rows, { onConflict: "skill_id", ignoreDuplicates: keepExisting }), "save skills");
  }
}

/** Removes every responsibility of a job (before saving its new list). */
export async function deleteResponsibilities(db: Db, employmentId: string): Promise<void> {
  check(await db.from("employment_responsibilities").delete().eq("employment_id", employmentId), "clear responsibilities");
}

/** Removes a skill from the owner's list (the catalog keeps it). */
export async function deleteUserSkill(db: Db, skillId: string): Promise<void> {
  check(await db.from("profile_skills").delete().eq("skill_id", skillId), "remove skill");
}

/** Adds an education entry. */
export async function insertEducation(db: Db, row: Insert<"educations">): Promise<void> {
  check(await db.from("educations").insert(row), "add education");
}

/** Adds a certification. */
export async function insertCertification(db: Db, row: Insert<"certifications">): Promise<void> {
  check(await db.from("certifications").insert(row), "add certification");
}

/** Whether any job is stored (to decide whether to import a profile). */
export async function hasEmployment(db: Db): Promise<boolean> {
  const res = await db.from("employments").select("id", { count: "exact", head: true });
  if (res.error) unwrap(res, "count jobs");
  return (res.count ?? 0) > 0;
}
