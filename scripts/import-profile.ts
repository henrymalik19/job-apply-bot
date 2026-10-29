// Imports the owner's profile from the old app export (data/old, git-ignored):
// facts (unreviewed), the master resume, and initial matching criteria from
// the old "Remote Development" search. Skips each part that already exists.
//   pnpm import:profile
import { readFileSync } from "node:fs";
import { createServiceClient } from "@/server/db/service-client";
import { getMatchCriteria, saveMatchCriteria } from "@/server/modules/criteria/criteria.service";
import { importFacts, importMasterResume, type NewFact } from "@/server/modules/profile/profile.service";
import { parseWorkerEnv } from "@/shared/env";

const OWNER = "user_3EFlbJRuJcCvNFjdzJaa3dkeoNP"; // the real account in the old app
const SOURCE = "old app (Aug 2026 profile)";
const read = <T>(file: string): T => JSON.parse(readFileSync(`data/old/${file}`, "utf8")) as T;

type Profile = Record<string, string | boolean | number | string[] | null>;
type Work = { career_profile_id: string; company: string; title: string; start_date: string; end_date: string | null; is_current: boolean; achievements: string[] | null };
type Education = { career_profile_id: string; institution: string; degree: string; field_of_study: string; start_year: number | null; end_year: number | null };
type Skill = { career_profile_id: string; name: string; years_experience: number | null };

function buildFacts(): NewFact[] {
  const profile = read<Profile[]>("profiles.json").find((p) => p.user_id === OWNER);
  if (!profile) throw new Error("owner profile not found in data/old/profiles.json");
  const pid = profile.id;
  const facts: NewFact[] = [];
  const add = (category: string, fact: string, structured: Record<string, unknown> | null = null) =>
    facts.push({ category, fact, structured: structured as NewFact["structured"], source: SOURCE, reviewed: false, sort_order: facts.length });

  if (profile.summary) add("summary", String(profile.summary));

  // Current job first (what the owner told us), then the old history newest first.
  add("employment", "Staff Software Engineer at Second Nature, 2026 to present (start month to confirm).", {
    employer: "Second Nature", title: "Staff Software Engineer", current: true,
  });
  const work = read<Work[]>("work_experiences.json")
    .filter((w) => w.career_profile_id === pid)
    .sort((a, b) => b.start_date.split("/").reverse().join("").localeCompare(a.start_date.split("/").reverse().join("")));
  for (const w of work) {
    const end = w.is_current ? "2026 (end month to confirm)" : w.end_date;
    add("employment", `${w.title} at ${w.company}, ${w.start_date} to ${end}.`, { employer: w.company, title: w.title, start: w.start_date, end });
    for (const a of w.achievements ?? []) add("metric", `At ${w.company} (${w.title}): ${a}`, { employer: w.company });
  }

  for (const e of read<Education[]>("educations.json").filter((x) => x.career_profile_id === pid)) {
    const years = e.end_year ? `${e.start_year ?? ""}–${e.end_year}` : `started ${e.start_year} (completion year to confirm)`;
    add("education", `${e.degree} in ${e.field_of_study}, ${e.institution}, ${years}.`);
  }

  const skills = read<Skill[]>("skills.json").filter((s) => s.career_profile_id === pid);
  const withYears = skills.filter((s) => s.years_experience).sort((a, b) => (b.years_experience ?? 0) - (a.years_experience ?? 0));
  const other = skills.filter((s) => !s.years_experience).map((s) => s.name);
  if (withYears.length) add("skill", `Skills with years of experience: ${withYears.map((s) => `${s.name} (${s.years_experience})`).join(", ")}.`);
  if (other.length) add("skill", `Other skills: ${other.join(", ")}.`);

  if (profile.requires_sponsorship === false) {
    add("authorization", "Authorized to work in the United States; does not require visa sponsorship.");
  }
  add("logistics", `Based in ${profile.city}, ${profile.state}; prefers ${String(profile.remote_preference).toLowerCase()} work; not willing to relocate; available immediately.`);
  if (profile.salary_min) add("logistics", `Salary expectation: $${Number(profile.salary_min).toLocaleString()}–$${Number(profile.salary_max).toLocaleString()} per year.`);
  for (const [label, key] of [["LinkedIn", "linkedin_url"], ["GitHub", "github_url"], ["Website", "portfolio_url"]] as const) {
    if (profile[key]) add("link", `${label}: ${profile[key]}`);
  }
  return facts;
}

async function main() {
  const db = createServiceClient(parseWorkerEnv(process.env));

  const facts = await importFacts(db, buildFacts());

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

  console.log(JSON.stringify({ ok: true, facts, resumeStored, criteria }));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.message ?? err) }));
  process.exit(1);
});
