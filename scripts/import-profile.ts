// Imports the owner's profile from the old app export (data/old, git-ignored)
// into the structured profile tables (contact details, work authorization,
// employment with responsibilities and skills used, education, skills), the
// master resume, and initial matching criteria from the old "Remote
// Development" search. Skips each part that already exists.
//   pnpm import:profile
import { readFileSync } from "node:fs";
import { createServiceClient } from "@/server/db/service-client";
import { getMatchCriteria, saveMatchCriteria } from "@/server/modules/criteria/criteria.service";
import { getProfile, importMasterResume, importProfile, type ProfileImport } from "@/server/modules/profile/profile.service";
import { parseWorkerEnv } from "@/shared/env";

const OWNER = "user_3EFlbJRuJcCvNFjdzJaa3dkeoNP"; // the real account in the old app
const read = <T>(file: string): T => JSON.parse(readFileSync(`data/old/${file}`, "utf8")) as T;

type Profile = Record<string, string | boolean | number | string[] | null>;
type Work = {
  career_profile_id: string; company: string; title: string; location: string | null; is_remote: boolean;
  start_date: string; end_date: string | null; is_current: boolean; description: string | null;
  achievements: string[] | null; technologies: string[] | null;
};
type Education = { career_profile_id: string; institution: string; degree: string; field_of_study: string; start_year: number | null; end_year: number | null; is_current: boolean };
type Skill = { career_profile_id: string; name: string; years_experience: number | null };

// "08/2021" → "2021-08" (what the month inputs send).
const month = (mmyyyy: string | null) => {
  const m = /^(\d{1,2})\/(\d{4})$/.exec(mmyyyy ?? "");
  return m ? `${m[2]}-${m[1].padStart(2, "0")}` : "";
};
const str = (v: unknown) => (v == null ? "" : String(v));

function buildImport(existingSummary: string | null): ProfileImport {
  const p = read<Profile[]>("profiles.json").find((x) => x.user_id === OWNER);
  if (!p) throw new Error("owner profile not found in data/old/profiles.json");
  const state = str(p.state).trim().toUpperCase();

  // The old app's "current" job ended when the owner joined Second Nature in August 2026.
  const work = read<Work[]>("work_experiences.json").filter((w) => w.career_profile_id === p.id);
  const employment: Record<string, unknown>[] = [
    { employer: "Second Nature", title: "Staff Software Engineer", start_date: "2026-08", end_date: "", is_current: "true", responsibilities: "", skills: "" },
    ...work.map((w) => ({
      employer: w.company,
      title: w.title,
      location: w.location ?? (w.is_remote ? "Remote" : ""),
      start_date: month(w.start_date),
      end_date: w.is_current ? "2026-08" : month(w.end_date),
      is_current: "false",
      description: (w.description ?? "").slice(0, 500),
      responsibilities: (w.achievements ?? []).join("\n"),
      skills: (w.technologies ?? []).join(", "),
    })),
  ];

  return {
    profile: {
      preferred_name: str(p.preferred_name),
      phone: str(p.phone),
      city: str(p.city),
      state: state.length === 2 ? state : "",
      country: "US",
      postal_code: str(p.zip_code),
      linkedin_url: str(p.linkedin_url),
      github_url: str(p.github_url),
      website_url: str(p.portfolio_url),
      summary: existingSummary ?? str(p.summary),
      willing_to_relocate: /^(yes|true)$/i.test(str(p.willing_to_relocate)) ? "yes" : /^(no|false)$/i.test(str(p.willing_to_relocate)) ? "no" : "",
      notice_period: str(p.start_date),
    },
    workAuthorizations: (Array.isArray(p.work_authorized_countries) ? p.work_authorized_countries : ["US"]).map((country) => ({
      country,
      authorized: "yes",
      requires_sponsorship: p.requires_sponsorship ? "yes" : "no",
    })),
    employment,
    education: read<Education[]>("educations.json")
      .filter((e) => e.career_profile_id === p.id)
      .map((e) => ({
        institution: e.institution, degree: e.degree, field_of_study: e.field_of_study,
        start_year: str(e.start_year), end_year: str(e.end_year), completed: e.is_current ? "false" : "true",
      })),
    skills: read<Skill[]>("skills.json")
      .filter((s) => s.career_profile_id === p.id)
      .sort((x, y) => (y.years_experience ?? 0) - (x.years_experience ?? 0))
      .map((s) => ({ name: s.name, years: s.years_experience ?? null })),
  };
}

async function main() {
  const db = createServiceClient(parseWorkerEnv(process.env));

  const owner = await db.from("users").select("id").eq("role", "owner").single();
  if (owner.error) throw new Error("no owner set (pnpm owner:set)");
  const existing = await getProfile(db);
  const profile = await importProfile(db, owner.data.id, buildImport(existing.profile.summary));

  const resume = read<{ user_id: string; content: string; name: string }[]>("master_resumes.json").find((r) => r.user_id === OWNER);
  const resumeStored = resume ? await importMasterResume(db, `Imported: ${resume.name}`, resume.content) : false;

  // Initial matching criteria from the old "Remote Development" search, only if still the defaults.
  let criteria = false;
  const current = await getMatchCriteria(db);
  if (current.criteria.roles.length === 0) {
    const search = read<{ user_id: string; name: string; target_roles: string[]; target_salary_min: number | null }[]>("job_searches.json")
      .find((s) => s.user_id === OWNER);
    criteria = (
      await saveMatchCriteria(db, {
        roles: (search?.target_roles ?? []).join(", "),
        seniority: ["senior", "staff", "principal", "lead", "manager"],
        minSalary: String(search?.target_salary_min ?? ""),
        dealbreakers: "",
        excludedCompanies: "Second Nature",
        threshold: "75",
        notes: "",
      })
    ).created;
  }

  console.log(JSON.stringify({ ok: true, profile, resumeStored, criteria }));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.message ?? err) }));
  process.exit(1);
});
