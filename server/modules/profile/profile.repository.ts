import type { Db, Insert, Row, Update } from "@/server/db/types";
import { check, unwrap } from "@/server/core/errors";
import { normalize } from "@/shared/text";
import type { Employment, ProfileData, UserSkill } from "./profile-data";

/** Loads a user's whole profile in parallel queries. */
export async function loadProfileData(db: Db, userId: string): Promise<ProfileData> {
  const [profile, auths, jobs, education, skills, certifications] = await Promise.all([
    db.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
    db.from("work_authorizations").select("*").eq("user_id", userId).order("country"),
    db
      .from("employments")
      .select("*, employment_responsibilities(*), employment_skills(skills(name))")
      .eq("user_id", userId)
      .order("is_current", { ascending: false })
      .order("start_date", { ascending: false }),
    db.from("educations").select("*").eq("user_id", userId).order("sort_order").order("end_year", { ascending: false, nullsFirst: true }),
    db.from("profile_skills").select("*, skills(name, normalized, category)").eq("user_id", userId).order("sort_order").order("created_at"),
    db.from("certifications").select("*").eq("user_id", userId).order("sort_order").order("issued_on", { ascending: false }),
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
    profile: profile.data ?? emptyProfile(userId),
    workAuthorizations: unwrap(auths, "load work authorizations"),
    employment,
    education: unwrap(education, "load education"),
    skills: userSkills,
    certifications: unwrap(certifications, "load certifications"),
  };
}

function emptyProfile(userId: string): Row<"profiles"> {
  return {
    user_id: userId, first_name: null, last_name: null, preferred_name: null, email: null, phone: null, city: null, state: null,
    country: "US", postal_code: null, linkedin_url: null, github_url: null, website_url: null, headline: null, summary: null,
    notice_period: null, created_at: new Date(0).toISOString(), updated_at: new Date(0).toISOString(),
  };
}

/** Creates or updates a user's profile row. */
export async function upsertProfile(db: Db, userId: string, changes: Omit<Insert<"profiles">, "user_id">): Promise<void> {
  check(await db.from("profiles").upsert({ ...changes, user_id: userId }), "save profile");
}

/** Creates or replaces a user's authorization row for a country. */
export async function upsertWorkAuthorization(db: Db, userId: string, row: Omit<Insert<"work_authorizations">, "user_id">): Promise<void> {
  check(await db.from("work_authorizations").upsert({ ...row, user_id: userId }, { onConflict: "user_id,country" }), "save work authorization");
}

/** Deletes one of a user's rows from a profile list table. */
export async function deleteRow(
  db: Db,
  userId: string,
  table: "work_authorizations" | "employments" | "educations" | "certifications",
  id: string,
): Promise<void> {
  check(await db.from(table).delete().eq("user_id", userId).eq("id", id), `delete from ${table}`);
}

/** Adds a job for a user and returns its id. */
export async function insertEmployment(db: Db, userId: string, row: Omit<Insert<"employments">, "user_id">): Promise<string> {
  return unwrap(await db.from("employments").insert({ ...row, user_id: userId }).select("id").single(), "add job").id;
}

/**
 * Updates one of a user's jobs.
 *
 * @returns Whether the job exists and is theirs (only then may its responsibilities and skills change).
 */
export async function updateEmployment(db: Db, userId: string, id: string, changes: Update<"employments">): Promise<boolean> {
  const rows = unwrap(await db.from("employments").update(changes).eq("user_id", userId).eq("id", id).select("id"), "update job");
  return rows.length > 0;
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
 * Adds or updates skills a user has.
 *
 * @param keepExisting - Only add missing skills; leave existing rows (and their overrides) as they are.
 */
export async function upsertUserSkills(
  db: Db,
  userId: string,
  rows: Omit<Insert<"profile_skills">, "user_id">[],
  keepExisting = false,
): Promise<void> {
  if (rows.length) {
    check(
      await db
        .from("profile_skills")
        .upsert(rows.map((r) => ({ ...r, user_id: userId })), { onConflict: "user_id,skill_id", ignoreDuplicates: keepExisting }),
      "save skills",
    );
  }
}

/** Removes every responsibility of a job (before saving its new list). */
export async function deleteResponsibilities(db: Db, employmentId: string): Promise<void> {
  check(await db.from("employment_responsibilities").delete().eq("employment_id", employmentId), "clear responsibilities");
}

/** Removes a skill from a user's list (the catalog keeps it). */
export async function deleteUserSkill(db: Db, userId: string, skillId: string): Promise<void> {
  check(await db.from("profile_skills").delete().eq("user_id", userId).eq("skill_id", skillId), "remove skill");
}

/** Unlinks a skill from every one of a user's jobs. */
export async function detachSkillFromJobs(db: Db, userId: string, skillId: string): Promise<void> {
  const jobs = unwrap(await db.from("employments").select("id").eq("user_id", userId), "read jobs");
  if (jobs.length === 0) return;
  check(await db.from("employment_skills").delete().eq("skill_id", skillId).in("employment_id", jobs.map((j) => j.id)), "unlink skill");
}

/**
 * Folds one skill into another for a user: the merged name (and any aliases
 * pointing at it) become aliases of the kept skill in the shared catalog, the
 * user's jobs and skill list point at the kept skill, and the kept row inherits
 * a years override or proficiency it didn't have. The merged catalog row stays
 * (other users may use it) but every future lookup of its name finds the kept one.
 */
export async function mergeUserSkill(db: Db, userId: string, keepId: string, mergeId: string): Promise<void> {
  const merged = unwrap(await db.from("skills").select("normalized").eq("id", mergeId).single(), "read merged skill");
  check(await db.from("skill_aliases").update({ skill_id: keepId }).eq("skill_id", mergeId), "repoint aliases");
  check(await db.from("skill_aliases").upsert({ alias: merged.normalized, skill_id: keepId }, { onConflict: "alias" }), "add alias");

  const jobs = unwrap(await db.from("employments").select("id").eq("user_id", userId), "read jobs").map((j) => j.id);
  if (jobs.length) {
    const links = unwrap(await db.from("employment_skills").select("employment_id").eq("skill_id", mergeId).in("employment_id", jobs), "read job skills");
    if (links.length) {
      check(
        await db.from("employment_skills").upsert(links.map((l) => ({ employment_id: l.employment_id, skill_id: keepId })), { onConflict: "employment_id,skill_id", ignoreDuplicates: true }),
        "link kept skill",
      );
      check(await db.from("employment_skills").delete().eq("skill_id", mergeId).in("employment_id", jobs), "unlink merged skill");
    }
  }

  const rows = unwrap(await db.from("profile_skills").select("*").eq("user_id", userId).in("skill_id", [keepId, mergeId]), "read skill rows");
  const from = rows.find((r) => r.skill_id === mergeId);
  if (from) {
    const into = rows.find((r) => r.skill_id === keepId);
    check(
      await db.from("profile_skills").upsert(
        {
          user_id: userId,
          skill_id: keepId,
          years_override: into?.years_override ?? from.years_override,
          proficiency: into?.proficiency ?? from.proficiency,
          last_used_year: Math.max(into?.last_used_year ?? 0, from.last_used_year ?? 0) || null,
          sort_order: into?.sort_order ?? from.sort_order,
        },
        { onConflict: "user_id,skill_id" },
      ),
      "keep skill row",
    );
    check(await db.from("profile_skills").delete().eq("user_id", userId).eq("skill_id", mergeId), "remove merged skill row");
  }
}

/** Adds an education entry for a user. */
export async function insertEducation(db: Db, userId: string, row: Omit<Insert<"educations">, "user_id">): Promise<void> {
  check(await db.from("educations").insert({ ...row, user_id: userId }), "add education");
}

/** Adds a certification for a user. */
export async function insertCertification(db: Db, userId: string, row: Omit<Insert<"certifications">, "user_id">): Promise<void> {
  check(await db.from("certifications").insert({ ...row, user_id: userId }), "add certification");
}

/** Whether a user has any job stored (to decide whether to import a profile). */
export async function hasEmployment(db: Db, userId: string): Promise<boolean> {
  const res = await db.from("employments").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (res.error) unwrap(res, "count jobs");
  return (res.count ?? 0) > 0;
}
