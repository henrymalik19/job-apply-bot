// The resume as data. A tailoring plan from Claude only picks and orders jobs
// (by id), rewords their responsibilities, writes the summary and orders
// skills; employer, title, dates, education and contact details always come
// from the profile, so they can't be invented. The untailored resume uses the
// same shape, built straight from the profile.
import { z } from "zod";
import { employmentRange, type ProfileData } from "@/server/modules/profile/profile.service";

/** One job on the resume. */
export type ResumeJob = {
  employment_id: string;
  employer: string;
  title: string;
  location: string | null;
  dates: string;
  bullets: string[];
};

/** A rendered-ready resume. */
export type ResumeDoc = {
  name: string;
  headline: string | null;
  contact: string[];
  summary: string | null;
  experience: ResumeJob[];
  skills: string[];
  education: string[];
  certifications: string[];
};

/** What Claude returns when tailoring: choices and wording only. */
export const tailorPlanSchema = z.object({
  summary: z.string(),
  experience: z.array(z.object({ employment_id: z.string(), bullets: z.array(z.string()) })),
  skills: z.array(z.string()),
});
/** A tailoring plan. */
export type TailorPlan = z.infer<typeof tailorPlanSchema>;

/** Most bullets per job and skills listed, so a resume stays on one or two pages. */
export const LIMITS = { bulletsPerJob: 6, skills: 24 } as const;

function header(data: ProfileData): Pick<ResumeDoc, "name" | "headline" | "contact" | "education" | "certifications"> {
  const p = data.profile;
  const place = [p.city, p.state].filter(Boolean).join(", ");
  return {
    name: [p.preferred_name || p.first_name, p.last_name].filter(Boolean).join(" ") || "Your name",
    headline: p.headline,
    contact: [place, p.email, p.phone, p.linkedin_url, p.github_url, p.website_url].filter((v): v is string => Boolean(v)),
    education: data.education.map((e) => {
      const what = [e.degree, e.field_of_study && `in ${e.field_of_study}`].filter(Boolean).join(" ") || "Coursework";
      const when = e.completed ? (e.end_year ? ` (${e.end_year})` : "") : " (in progress)";
      return `${what}, ${e.institution}${when}`;
    }),
    certifications: data.certifications.map((c) => [c.name, c.issuer, c.issued_on?.slice(0, 4)].filter(Boolean).join(", ")),
  };
}

function job(j: ProfileData["employment"][number], bullets: string[]): ResumeJob {
  return { employment_id: j.id, employer: j.employer, title: j.title, location: j.location, dates: employmentRange(j), bullets };
}

/** The untailored resume: every job newest first with its responsibilities, and every skill. */
export function masterResume(data: ProfileData): ResumeDoc {
  return {
    ...header(data),
    summary: data.profile.summary,
    experience: data.employment.map((j) => job(j, j.responsibilities.map((r) => r.text).slice(0, LIMITS.bulletsPerJob))),
    skills: data.skills.map((s) => s.name).slice(0, LIMITS.skills),
  };
}

/**
 * Builds the resume from a tailoring plan: the jobs the plan kept plus every
 * current job, newest first (the profile's order), with the plan's bullets;
 * employer/title/dates from the profile. Call only after the plan passed the
 * fact guard.
 */
export function assembleResume(plan: TailorPlan, data: ProfileData): ResumeDoc {
  const bullets = new Map(plan.experience.map((e) => [e.employment_id, e.bullets.map((b) => b.trim()).filter(Boolean)]));
  return {
    ...header(data),
    summary: plan.summary.trim() || data.profile.summary,
    experience: data.employment
      .filter((j) => bullets.has(j.id) || j.is_current)
      .map((j) => job(j, (bullets.get(j.id) ?? []).slice(0, LIMITS.bulletsPerJob))),
    skills: plan.skills.slice(0, LIMITS.skills),
  };
}
