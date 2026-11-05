// Reading a catalog question's answer from where it lives (profile, criteria,
// skill years), and fitting any answer to the form's field type and options by
// rule. Anything that doesn't fit cleanly returns null and the question goes to
// the owner.
import type { FormOption, FormQuestion } from "@/server/integrations/ats/forms";
import type { MatchCriteria } from "@/server/modules/criteria/criteria.service";
import { resolvePlace } from "@/server/modules/criteria/places";
import { currentJob, skillYears, totalYears, type ProfileData } from "@/server/modules/profile/profile.service";
import { normalize } from "@/shared/text";
import { CLEARANCE_LEVELS, type ClearanceLevel } from "@/shared/clearance";

/** An answer's value: boolean, number, salary-style range, or text. */
export type AnswerValue = boolean | number | { min: number; max: number } | string;

/** The answer for one form field: display text plus the structured value the form takes. */
export type ShapedAnswer = { answer: string; value: string | string[] | boolean };

/** Normalizes a question's wording for the alias lookup ("Do you require sponsorship?" → "do you require sponsorship"). */
export function normalizeQuestion(label: string): string {
  return normalize(label);
}

/**
 * The value of a question answered from the profile (by its key), or null when
 * the profile doesn't state it.
 *
 * @param country - The posting's country (ISO code), for work authorization.
 * @param company - The posting's company, for "have you worked here before?".
 */
export function profileValue(key: string, data: ProfileData, opts: { country: string; now: Date; company?: string }): AnswerValue | null {
  const p = data.profile;
  const auth = data.workAuthorizations.find((a) => a.country === opts.country);
  switch (key) {
    case "full_name":
      return [p.first_name, p.last_name].filter(Boolean).join(" ") || null;
    case "current_location":
      return p.city && p.state ? `${p.city}, ${p.state}` : p.city ?? null;
    case "country_of_residence":
      return p.country ? countryName(p.country) : null;
    case "work_authorization":
      return auth ? auth.authorized : null;
    case "requires_sponsorship":
      return auth ? auth.requires_sponsorship : null;
    case "current_company_name":
      return currentJob(data)?.employer ?? null;
    case "current_job_title":
      return currentJob(data)?.title ?? null;
    case "years_experience_total":
      return data.employment.length ? totalYears(data, opts.now) : null;
    case "has_security_clearance":
      return p.security_clearance == null ? null : p.security_clearance !== "none";
    case "security_clearance_level":
      return p.security_clearance == null ? null : CLEARANCE_LEVELS[p.security_clearance as ClearanceLevel];
    case "previously_employed_here": {
      if (!opts.company || data.employment.length === 0) return null;
      const company = opts.company;
      return data.employment.some((e) => sameCompany(e.employer, company));
    }
    case "first_name": case "last_name": case "preferred_name": case "email": case "phone":
    case "postal_code": case "linkedin_url": case "github_url": case "website_url": case "notice_period":
      return p[key] ?? null;
    default:
      return null;
  }
}

/** "US" → "United States": a country's name in English from its ISO code (the code when it isn't one). */
export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** Words a company name can end in that don't tell two companies apart ("Rula Health, Inc." is Rula). */
const COMPANY_SUFFIX = /\s+(inc|llc|ltd|limited|corp|corporation|co|company|plc|gmbh|technologies|technology|labs|health|group|holdings)$/;

/** A company name reduced to what identifies it. */
function companyKey(name: string): string {
  let key = normalize(name).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  for (let before = ""; before !== key; ) {
    before = key;
    key = key.replace(COMPANY_SUFFIX, "");
  }
  return key;
}

/** Whether two company names are the same company ("Rula" and "Rula Health, Inc."). */
export function sameCompany(a: string, b: string): boolean {
  const x = companyKey(a);
  return x !== "" && x === companyKey(b);
}

/** The value of a question answered from the matching criteria (by its key), or null when not set. */
export function criteriaValue(key: string, criteria: MatchCriteria): AnswerValue | null {
  switch (key) {
    case "salary_expectation":
      return criteria.salary_min == null ? null : { min: criteria.salary_min, max: criteria.salary_max ?? criteria.salary_min };
    case "willing_to_relocate":
      return criteria.willing_to_relocate;
    default:
      return null;
  }
}

/** Years with a catalog skill (computed from job dates, or the override), or null when the owner doesn't have it. */
export function skillYearsValue(skillId: string, data: ProfileData, now: Date): number | null {
  const skill = data.skills.find((s) => s.skill_id === skillId);
  return skill ? (skillYears(data, now).get(skill.normalized) ?? null) : null;
}

const yesNo = (b: boolean) => (b ? "Yes" : "No");

function optionStarting(options: FormOption[], word: "yes" | "no"): FormOption | undefined {
  const matches = options.filter((o) => normalize(o.label).split(" ")[0] === word);
  return matches.length === 1 ? matches[0] : undefined;
}

// "3-5 years", "$150,000 - $175,000", "10+", "Less than 2" → [lo, hi].
function optionRange(label: string): [number, number] | null {
  const nums = [...label.replace(/,/g, "").matchAll(/(\d+(?:\.\d+)?)\s*(k)?/gi)].map((m) => Number(m[1]) * (m[2] ? 1000 : 1));
  if (nums.length === 0) return null;
  if (/\+|or more|and above|over|more than/i.test(label)) return [nums[0], Infinity];
  if (/less than|under|fewer than|below/i.test(label)) return [-Infinity, nums[0]];
  return nums.length >= 2 ? [nums[0], nums[1]] : [nums[0], nums[0]];
}

function pickByNumber(options: FormOption[], n: number): FormOption | undefined {
  const hits = options.filter((o) => {
    const r = optionRange(o.label);
    return r !== null && n >= r[0] && n <= r[1];
  });
  return hits.length === 1 ? hits[0] : undefined;
}

function pickByText(options: FormOption[], text: string): FormOption | undefined {
  const want = normalize(text);
  const exact = options.filter((o) => normalize(o.label) === want);
  if (exact.length === 1) return exact[0];
  // A place answer ("Houston, TX") picks the one option naming the same state ("Texas").
  const states = resolvePlace(text).states;
  if (states.size === 1) {
    const [state] = states;
    const byState = options.filter((o) => {
      const s = resolvePlace(o.label).states;
      return s.size === 1 && s.has(state);
    });
    if (byState.length === 1) return byState[0];
  }
  // Or the one option naming the same country ("United States" vs "Canada (outside of Quebec)" for "Atlanta, GA").
  const countries = resolvePlace(text).countries;
  if (countries.size === 1) {
    const [country] = countries;
    const byCountry = options.filter((o) => {
      const c = resolvePlace(o.label).countries;
      return c.size === 1 && c.has(country);
    });
    if (byCountry.length === 1) return byCountry[0];
  }
  return undefined;
}

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

/**
 * Fits a topic value to one form question, or returns null when it doesn't fit
 * cleanly (no single matching option, or a file field).
 *
 * @param inverted - The wording asks the opposite of the topic (yes/no values flip).
 */
export function shapeAnswer(question: Pick<FormQuestion, "fieldType" | "options">, value: AnswerValue, inverted = false): ShapedAnswer | null {
  const { fieldType, options } = question;
  if (fieldType === "file" || fieldType === "hidden") return null;
  const choose = (o: FormOption | undefined): ShapedAnswer | null =>
    o ? { answer: o.label, value: fieldType === "multiselect" ? [o.value] : o.value } : null;

  if (typeof value === "boolean") {
    const b = inverted ? !value : value;
    if (fieldType === "boolean") return { answer: yesNo(b), value: b };
    if (fieldType === "select" || fieldType === "multiselect") return choose(optionStarting(options, b ? "yes" : "no"));
    return { answer: yesNo(b), value: yesNo(b) };
  }
  if (inverted) return null;
  if (typeof value === "number") {
    if (fieldType === "select" || fieldType === "multiselect") return choose(pickByNumber(options, value));
    if (fieldType === "boolean") return null;
    return { answer: String(value), value: String(value) };
  }
  if (typeof value === "object") {
    if (fieldType === "select" || fieldType === "multiselect") return choose(pickByNumber(options, value.min));
    if (fieldType === "boolean") return null;
    const text = value.min === value.max ? money(value.min) : `${money(value.min)}–${money(value.max)}`;
    return { answer: text, value: text };
  }
  if (fieldType === "select" || fieldType === "multiselect") return choose(pickByText(options, value));
  if (fieldType === "boolean") return null;
  return { answer: value, value };
}

/** The "decline to answer" option of a voluntary EEO question, if it has exactly one. */
export function declineOption(question: Pick<FormQuestion, "fieldType" | "options">): ShapedAnswer | null {
  const declines = question.options.filter((o) => o.decline);
  if (declines.length !== 1) return null;
  const o = declines[0];
  return { answer: o.label, value: question.fieldType === "multiselect" ? [o.value] : o.value };
}
