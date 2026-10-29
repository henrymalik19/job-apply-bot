// Deriving a form's answer from an answer topic: profile topics read their
// value from the structured profile, and every value is fitted to the
// question's field type and options by rule. Anything that doesn't fit cleanly
// returns null and the question goes to the owner.
import type { FormOption, FormQuestion } from "@/server/integrations/ats/forms";
import { resolvePlace } from "@/server/modules/criteria/places";
import { findUserSkill, skillYears, type ProfileData } from "@/server/modules/profile/profile.service";
import { normalize } from "@/shared/text";

/** A topic's value: boolean, number, salary-style range, or text. */
export type TopicValue = boolean | number | { min: number; max: number } | string;

/** The answer for one form field: display text plus the structured value the form takes. */
export type ShapedAnswer = { answer: string; value: string | string[] | boolean };

/** Normalizes a question's wording for the variants lookup ("Do you require sponsorship?" → "do you require sponsorship"). */
export function normalizeQuestion(label: string): string {
  return normalize(label);
}

/** Topic keys answered from the profile rather than a saved answer. */
export const PROFILE_TOPICS = [
  "first_name", "last_name", "full_name", "preferred_name", "email", "phone", "current_location", "city", "state",
  "postal_code", "linkedin_url", "github_url", "website_url", "work_authorization", "requires_sponsorship",
  "willing_to_relocate", "notice_period",
] as const;

/** Whether a topic's value comes from the profile: the keys above and "years:<skill>". */
export function isProfileTopic(key: string): boolean {
  return (PROFILE_TOPICS as readonly string[]).includes(key) || key.startsWith("years:");
}

/**
 * The value of a profile topic, or null when the profile doesn't state it.
 *
 * @param country - The posting's country (ISO code), for work authorization.
 */
export function profileValue(key: string, data: ProfileData, opts: { country: string; now: Date }): TopicValue | null {
  const p = data.profile;
  const auth = data.workAuthorizations.find((a) => a.country === opts.country);
  const full = [p.first_name, p.last_name].filter(Boolean).join(" ");
  if (key.startsWith("years:")) {
    // A listed skill (or alias) first, else a skill only named on a job.
    const name = key.slice("years:".length);
    const skill = findUserSkill(data, name);
    return skillYears(data, opts.now).get(skill?.normalized ?? normalize(name)) ?? null;
  }
  switch (key) {
    case "full_name":
      return full || null;
    case "current_location":
      return p.city && p.state ? `${p.city}, ${p.state}` : p.city ?? null;
    case "work_authorization":
      return auth ? auth.authorized : null;
    case "requires_sponsorship":
      return auth ? auth.requires_sponsorship : null;
    case "first_name": case "last_name": case "preferred_name": case "email": case "phone": case "city": case "state":
    case "postal_code": case "linkedin_url": case "github_url": case "website_url": case "willing_to_relocate": case "notice_period":
      return p[key] ?? null;
    default:
      return null;
  }
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
  return undefined;
}

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

/**
 * Fits a topic value to one form question, or returns null when it doesn't fit
 * cleanly (no single matching option, or a file field).
 *
 * @param inverted - The wording asks the opposite of the topic (yes/no values flip).
 */
export function shapeAnswer(question: Pick<FormQuestion, "fieldType" | "options">, value: TopicValue, inverted = false): ShapedAnswer | null {
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
