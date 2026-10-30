// The fact guard: a tailored resume may reorder, select and reword, never add.
// Employers, titles and dates can't be invented (the plan only names jobs by
// id); this checks the rest: every job id is real, every number in a bullet
// appears in that job's own responsibilities, the summary only uses numbers
// the profile states, no bullet names another employer, and every skill is
// one the profile lists.
import { normalize } from "@/shared/text";
import type { ProfileData } from "@/server/modules/profile/profile.service";
import type { TailorPlan } from "./resume-doc";

// "$2.5M", "40%", "1,200", "3x", "10+" → "2.5m", "40%", "1200", "3x", "10+".
const NUMBER = /\$?\d[\d,]*(?:\.\d+)?\s?(?:%|[kmb]\b|x\b|\+)?/gi;

/** The numbers in a text, normalized for comparison. */
export function numbersIn(text: string): Set<string> {
  return new Set([...text.matchAll(NUMBER)].map((m) => m[0].toLowerCase().replace(/[$,\s]/g, "")));
}

const mentions = (text: string, name: string) => {
  const n = normalize(name);
  return n.length > 2 && ` ${normalize(text)} `.includes(` ${n} `);
};

/**
 * Problems with a tailoring plan, or an empty list when it passes.
 *
 * @returns One line per problem, e.g. `number "55%" in a HUB bullet isn't in that job's responsibilities`.
 */
export function guardResume(plan: TailorPlan, data: ProfileData): string[] {
  const problems: string[] = [];
  const jobs = new Map(data.employment.map((j) => [j.id, j]));
  const allSource = [
    data.profile.summary ?? "",
    data.profile.headline ?? "",
    ...data.employment.flatMap((j) => [j.description ?? "", ...j.responsibilities.map((r) => r.text)]),
  ].join("\n");
  const allNumbers = numbersIn(allSource);

  for (const n of numbersIn(plan.summary)) {
    if (!allNumbers.has(n)) problems.push(`number "${n}" in the summary isn't in your profile`);
  }

  const seen = new Set<string>();
  for (const e of plan.experience) {
    const j = jobs.get(e.employment_id);
    if (!j) {
      problems.push(`unknown job "${e.employment_id}"`);
      continue;
    }
    if (seen.has(j.id)) problems.push(`${j.employer} appears twice`);
    seen.add(j.id);
    const own = numbersIn([j.description ?? "", ...j.responsibilities.map((r) => r.text)].join("\n"));
    const others = data.employment.filter((o) => o.employer !== j.employer).map((o) => o.employer);
    for (const b of e.bullets) {
      for (const n of numbersIn(b)) {
        if (!own.has(n)) problems.push(`number "${n}" in a ${j.employer} bullet isn't in that job's responsibilities`);
      }
      for (const other of others) {
        if (mentions(b, other)) problems.push(`a ${j.employer} bullet names another employer (${other})`);
      }
    }
  }

  const known = new Set([...data.skills.map((s) => s.normalized), ...data.employment.flatMap((j) => j.skills.map(normalize))]);
  for (const s of plan.skills) {
    if (!known.has(normalize(s))) problems.push(`skill "${s}" isn't in your profile`);
  }
  return problems;
}
