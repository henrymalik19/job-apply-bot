// The owner's whole profile as one snapshot, plus pure helpers: years per
// skill (from the dates of the jobs that used it) and the text form prompts
// see. Everything here counts as true; nothing else may be claimed.
import type { Row } from "@/server/db/types";
import { normalize } from "@/shared/text";

/** One job with what was done there and the skills used. */
export type Employment = Row<"employments"> & {
  responsibilities: Row<"employment_responsibilities">[];
  /** Skill names used at this job. */
  skills: string[];
};

/** A skill the owner has, with catalog fields. */
export type UserSkill = Row<"user_skills"> & Pick<Row<"skills">, "name" | "normalized" | "aliases" | "category">;

/** Everything known about the owner. */
export type ProfileData = {
  profile: Row<"profiles">;
  workAuthorizations: Row<"work_authorizations">[];
  employment: Employment[];
  education: Row<"educations">[];
  skills: UserSkill[];
  certifications: Row<"certifications">[];
  /** Active free-form facts. */
  facts: Row<"confirmed_facts">[];
};

/** A line of profile text for prompts. */
export type ProfileLine = { category: string; fact: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2021-03-01" → "Mar 2021". */
export function monthLabel(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** A job's date range for display: "Mar 2021 – present", or "– end date not set". */
export function employmentRange(job: Pick<Row<"employments">, "start_date" | "end_date" | "is_current">): string {
  const end = job.is_current ? "present" : job.end_date ? monthLabel(job.end_date) : "end date not set";
  return `${monthLabel(job.start_date)} – ${end}`;
}

const monthIndex = (date: string) => {
  const [y, m] = date.split("-").map(Number);
  return y * 12 + (m - 1);
};

/**
 * Years with each skill, keyed by normalized name: the merged date ranges of
 * the jobs that used it (overlapping jobs count once), rounded to a tenth,
 * unless the owner set `years_override`. Jobs without an end date that aren't
 * current count up to their start month only.
 */
export function skillYears(data: Pick<ProfileData, "employment" | "skills">, now: Date): Map<string, number> {
  const nowMonth = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const ranges = new Map<string, [number, number][]>();
  for (const job of data.employment) {
    const start = monthIndex(job.start_date);
    const end = job.is_current ? nowMonth : job.end_date ? monthIndex(job.end_date) : start;
    for (const skill of job.skills) {
      const key = normalize(skill);
      ranges.set(key, [...(ranges.get(key) ?? []), [start, end]]);
    }
  }
  const years = new Map<string, number>();
  for (const [key, list] of ranges) {
    list.sort((a, b) => a[0] - b[0]);
    let months = 0;
    let [curStart, curEnd] = list[0];
    for (const [s, e] of list.slice(1)) {
      if (s <= curEnd) curEnd = Math.max(curEnd, e);
      else {
        months += curEnd - curStart;
        [curStart, curEnd] = [s, e];
      }
    }
    months += curEnd - curStart;
    years.set(key, Math.round((months / 12) * 10) / 10);
  }
  for (const s of data.skills) if (s.years_override != null) years.set(s.normalized, Number(s.years_override));
  return years;
}

/** Finds a skill the owner has by name or alias ("k8s" → Kubernetes). */
export function findUserSkill(data: Pick<ProfileData, "skills">, name: string): UserSkill | undefined {
  const key = normalize(name);
  return data.skills.find((s) => s.normalized === key || s.aliases.some((a) => normalize(a) === key));
}

/**
 * The profile as prompt lines, in a stable order so prompts cache: summary,
 * jobs (newest first) with responsibilities and skills, education, skills with
 * years, certifications, work authorization, location, then free-form facts.
 */
export function profileLines(data: ProfileData, now: Date): ProfileLine[] {
  const lines: ProfileLine[] = [];
  const { profile } = data;
  if (profile.headline) lines.push({ category: "summary", fact: `Headline: ${profile.headline}` });
  if (profile.summary) lines.push({ category: "summary", fact: profile.summary });

  for (const job of data.employment) {
    const where = job.location ? `, ${job.location}` : "";
    lines.push({ category: "employment", fact: `${job.title} at ${job.employer}${where}, ${employmentRange(job)}.${job.description ? ` ${job.description}` : ""}` });
    for (const r of job.responsibilities) lines.push({ category: "achievement", fact: `At ${job.employer} (${job.title}): ${r.text}` });
    if (job.skills.length) lines.push({ category: "skill", fact: `Used at ${job.employer}: ${job.skills.join(", ")}.` });
  }

  for (const e of data.education) {
    const what = [e.degree, e.field_of_study && `in ${e.field_of_study}`].filter(Boolean).join(" ");
    const when = e.completed ? (e.end_year ? `, ${e.end_year}` : "") : `, in progress${e.start_year ? ` (started ${e.start_year})` : ""}`;
    lines.push({ category: "education", fact: `${what || "Studied"}, ${e.institution}${when}.` });
  }

  const years = skillYears(data, now);
  if (data.skills.length) {
    const described = data.skills.map((s) => {
      const y = years.get(s.normalized);
      return y ? `${s.name} (${y} yrs)` : s.name;
    });
    lines.push({ category: "skill", fact: `Skills: ${described.join(", ")}.` });
  }

  for (const c of data.certifications) {
    lines.push({ category: "certification", fact: `${c.name}${c.issuer ? `, ${c.issuer}` : ""}${c.issued_on ? `, ${c.issued_on.slice(0, 4)}` : ""}.` });
  }

  for (const a of data.workAuthorizations) {
    const can = a.authorized ? "Authorized to work" : "Not authorized to work";
    const sponsor = a.requires_sponsorship ? "requires visa sponsorship" : "does not require visa sponsorship";
    lines.push({ category: "authorization", fact: `${can} in ${a.country}; ${sponsor}${a.status ? ` (${a.status})` : ""}.` });
  }

  const place = [profile.city, profile.state].filter(Boolean).join(", ");
  const logistics = [
    place && `Based in ${place}`,
    profile.willing_to_relocate != null && (profile.willing_to_relocate ? "willing to relocate" : "not willing to relocate"),
    profile.notice_period && `notice period: ${profile.notice_period}`,
  ].filter(Boolean);
  if (logistics.length) lines.push({ category: "logistics", fact: `${logistics.join("; ")}.` });

  for (const f of data.facts) lines.push({ category: f.category, fact: f.fact });
  return lines;
}
