// What the apply runner types into a form: one step per prepared answer, by
// the form's own field name. Pure, so the mapping is tested without a browser.
import type { Json } from "@/server/db/types";
import { DECLINE } from "@/server/integrations/ats/forms";
import { resolvePlace } from "@/server/modules/criteria/places";

/** The prepared question fields the plan reads. */
export type PlanQuestion = {
  question: string;
  field_name: string | null;
  field_type: string | null;
  options: Json | null;
  required: boolean;
  answer: string | null;
  answer_value: Json | null;
  /** "cannot_automate" marks a step only you can do (an assessment, a file to attach). */
  bucket?: string;
};

/**
 * One field to fill: text typed, option labels picked, the resume attached, or a
 * place typed into a search box and the first suggestion starting with `value` picked,
 * a checkbox ticked, the closest suggestion in a search box picked, or a voluntary question declined (the option reading like "I don't
 * wish to answer" or "Decline To Self Identify", whichever the form uses).
 */
export type FillStep =
  | { kind: "text"; fieldName: string; label: string; required: boolean; value: string }
  | { kind: "select"; fieldName: string; label: string; required: boolean; value: string[] }
  | { kind: "location"; fieldName: string; label: string; required: boolean; value: string }
  | { kind: "check"; fieldName: string; label: string; required: boolean; value: true }
  | { kind: "decline"; fieldName: string; label: string; required: boolean }
  /** A search box: `value` (then shorter parts of it) is typed and the closest suggestion picked. */
  | { kind: "closest"; fieldName: string; label: string; required: boolean; value: string }
  | { kind: "resume"; fieldName: string; label: string; required: boolean };

/**
 * The steps in form order; why the form can't be filled (empty when it can); and the
 * required questions left for you to do in the Chrome window once the rest is filled.
 */
export type FillPlan = { steps: FillStep[]; blockers: string[]; yours: string[] };

const isResume = (q: PlanQuestion) => /resume|cv/i.test(`${q.field_name} ${q.question}`);

const REFERRED = /\b(were|was) you referred\b|\breferred by\b/i;

const optionsOf = (q: PlanQuestion) => (Array.isArray(q.options) ? (q.options as { label: string; value: string }[]) : []);

/** Option labels for the chosen values of a select (answer_value holds option values). */
function chosenLabels(q: PlanQuestion): string[] {
  const options = optionsOf(q);
  const values = Array.isArray(q.answer_value) ? q.answer_value.map(String) : q.answer_value == null ? [] : [String(q.answer_value)];
  const labels = values.map((v) => options.find((o) => o.value === v)?.label).filter((l): l is string => !!l);
  // Yes/No answers on a select carry the label itself as the value.
  return labels.length ? labels : q.answer ? [q.answer] : [];
}

/**
 * Builds the fill steps for an application's prepared questions.
 *
 * @param questions - The application's questions, in form order.
 * @returns Steps for every answered field; blockers for required fields with no usable answer;
 * the required steps only you can do (an assessment, a file other than the resume).
 */
export function buildFillPlan(questions: PlanQuestion[]): FillPlan {
  const steps: FillStep[] = [];
  const blockers: string[] = [];
  const yours: string[] = [];
  for (const q of questions) {
    if (!q.field_name || q.field_type === "hidden") continue;
    const base = { fieldName: q.field_name, label: q.question, required: q.required };
    if (q.field_type === "file" && isResume(q)) {
      steps.push({ kind: "resume", ...base });
      continue;
    }
    if (q.bucket === "cannot_automate" || q.field_type === "file") {
      if (q.required) yours.push(q.question);
      continue;
    }
    if (q.answer == null || q.answer.trim() === "") {
      if (q.required) blockers.push(`"${q.question}" has no answer`);
      // A voluntary question left blank is declined when the form offers that.
      else if (optionsOf(q).some((o) => DECLINE.test(o.label))) steps.push({ kind: "decline", ...base });
      // "Were you referred by a current employee?" left blank: you weren't (the form has no one to name).
      else if (REFERRED.test(q.question) && optionsOf(q).some((o) => o.label.trim() === "No")) steps.push({ kind: "select", ...base, value: ["No"] });
      continue;
    }
    if (q.field_type === "select" || q.field_type === "multiselect" || q.field_type === "boolean") {
      steps.push({ kind: "select", ...base, value: chosenLabels(q) });
    } else {
      steps.push({ kind: "text", ...base, value: q.answer });
    }
  }
  return { steps, blockers, yours };
}

const NUMBERS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, eight: 8, ten: 10 };
const pad = (n: number) => String(n).padStart(2, "0");
/** A date as date pickers take it typed: MM/DD/YYYY. */
export const pickerDate = (d: Date) => `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;

/**
 * An answer for a date picker ("earliest start date"), typed as MM/DD/YYYY: a date as it is, or when you
 * could start counted from today ("immediately available" is today, "2 weeks' notice" two weeks out).
 * A date already past counts as today. Null when it names no date.
 */
export function asPickerDate(answer: string, now: Date): string | null {
  const s = answer.trim().toLowerCase();
  if (!s) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const later = (d: Date) => pickerDate(d < today ? today : d);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return later(new Date(+iso[1], +iso[2] - 1, +iso[3]));
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (us) return later(new Date(+us[3], +us[1] - 1, +us[2]));
  if (/\b(immediate(ly)?|asap|right away|now|anytime|any time)\b/.test(s)) return pickerDate(today);
  const period = /\b(\d+|an?|one|two|three|four|five|six|eight|ten)\s*(?:-\s*)?(day|week|month)s?\b/.exec(s);
  if (period) {
    const n = /^\d+$/.test(period[1]) ? +period[1] : NUMBERS[period[1]];
    const d = new Date(today);
    if (period[2] === "day") d.setDate(d.getDate() + n);
    else if (period[2] === "week") d.setDate(d.getDate() + 7 * n);
    else d.setMonth(d.getMonth() + n);
    return pickerDate(d);
  }
  // "November 20, 2026" and the like.
  if (/[a-z]{3,}\s+\d{1,2},?\s+\d{4}/.test(s)) {
    const t = Date.parse(answer);
    if (!Number.isNaN(t)) return later(new Date(t));
  }
  return null;
}

/**
 * Whether a text field shows what was typed. Phone-like values count when the
 * digits match, since forms reformat them ("7045550100" -> "(704) 555-0100").
 */
export function sameText(shown: string, typed: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  if (norm(shown) === norm(typed)) return true;
  return /^[\d\s()+.-]+$/.test(typed) && shown.replace(/\D/g, "") === typed.replace(/\D/g, "");
}

/**
 * Whether a place box shows the place that was typed, or a broader one it's in: a search box picks
 * "Atlanta, Georgia, United States" for "Atlanta, GA", and one that only finds countries "United States".
 * "Denver, CO" for "Atlanta, GA" is a different place.
 */
export function samePlace(shown: string, typed: string): boolean {
  const want = resolvePlace(typed);
  const got = resolvePlace(shown);
  if (want.countries.size === 0 || got.countries.size === 0) return false;
  const within = <T,>(a: Set<T>, b: Set<T>) => [...a].every((x) => b.has(x));
  return within(got.countries, want.countries) && within(got.states, want.states) && within(got.cities, want.cities);
}

/** Greenhouse's self-identification fields, in form order. */
const EEOC_FIELDS = [
  ["gender", "Gender"],
  ["hispanic_ethnicity", "Are you Hispanic/Latino?"],
  ["race", "Race"],
  ["veteran_status", "Veteran Status"],
  ["disability_status", "Disability Status"],
] as const;

/** Where you live, from your profile, for form fields the ATS adds outside its question list. */
export type HomePlace = { city: string | null; stateName: string | null; country: string };

/** Your first education in the profile, for Greenhouse's optional Education section. */
export type Schooling = { institution: string; degree: string | null; fieldOfStudy: string | null; startYear: number | null; endYear: number | null };

/** Greenhouse's degree list for a degree as written in a profile ("B.S.", "Master of Science", "MBA"). */
export function greenhouseDegree(degree: string): string {
  const d = degree.toLowerCase().replace(/\./g, "");
  if (/\bmba\b|business administration/.test(d) && /\bm/.test(d)) return "Master of Business Administration (M.B.A.)";
  if (/\bph ?d\b|doctor(ate)? of philosophy/.test(d)) return "Doctor of Philosophy (Ph.D.)";
  if (/\bjd\b|juris/.test(d)) return "Juris Doctor (J.D.)";
  if (/\bmd\b|doctor of medicine/.test(d)) return "Doctor of Medicine (M.D.)";
  if (/master|\bm(s|a|sc|eng)\b/.test(d)) return "Master's Degree";
  if (/bachelor|\bb(s|a|sc|eng|e)\b/.test(d)) return "Bachelor's Degree";
  if (/associate|\ba(a|s)\b/.test(d)) return "Associate's Degree";
  if (/high school|diploma|ged/.test(d)) return "High School";
  return "Other";
}

/** The Education section's steps (first entry, ids ending "--0"); months aren't in the profile. */
export function educationSteps(school: Schooling): FillStep[] {
  const step = (fieldName: string, label: string) => ({ fieldName, label, required: false });
  const steps: FillStep[] = [{ kind: "closest", ...step("school--0", "School"), value: school.institution }];
  if (school.degree) steps.push({ kind: "select", ...step("degree--0", "Degree"), value: [greenhouseDegree(school.degree)] });
  if (school.fieldOfStudy) steps.push({ kind: "closest", ...step("discipline--0", "Discipline"), value: school.fieldOfStudy });
  if (school.startYear) steps.push({ kind: "text", ...step("start-year--0", "Start year"), value: String(school.startYear) });
  if (school.endYear) steps.push({ kind: "text", ...step("end-year--0", "End year"), value: String(school.endYear) });
  return steps;
}

/** Your most recent job, from the profile's work history (dates as YYYY-MM-DD). */
export type WorkRole = { employer: string; title: string; startDate: string; endDate: string | null; isCurrent: boolean };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * Greenhouse's Employment section for one job: company, title, start month and year,
 * then "Current role" ticked or the end month and year.
 */
export function employmentSteps(role: WorkRole): FillStep[] {
  const step = (fieldName: string, label: string) => ({ fieldName, label, required: false });
  const date = (iso: string, which: "start" | "end", label: string): FillStep[] => {
    const [year, month] = iso.split("-").map(Number);
    const steps: FillStep[] = [];
    if (month >= 1 && month <= 12) steps.push({ kind: "select", ...step(`${which}-date-month-0`, `${label} month`), value: [MONTHS[month - 1]] });
    if (year) steps.push({ kind: "text", ...step(`${which}-date-year-0`, `${label} year`), value: String(year) });
    return steps;
  };
  const steps: FillStep[] = [
    { kind: "text", ...step("company-name-0", "Company name"), value: role.employer },
    { kind: "text", ...step("title-0", "Title"), value: role.title },
    ...date(role.startDate, "start", "Start date"),
  ];
  if (role.isCurrent || !role.endDate) steps.push({ kind: "check", ...step("current-role-0", "Current role"), value: true });
  else steps.push(...date(role.endDate, "end", "End date"));
  return steps;
}

/**
 * Greenhouse fields that aren't in the job's question list: the phone's Country,
 * "Location (City)", the consent to processing the demographic answers (you
 * agreed to have it ticked), and the self-identification (EEOC) questions, declined
 * (for forms prepared before those were read; Race only shows once Hispanic/Latino is
 * "No", so after a decline it isn't there), your first education and your most recent job. Not required here: a form without them
 * skips them, and a form that needs them shows the gap when it is checked before submitting.
 */
export function greenhouseExtras(home: HomePlace, school: Schooling | null = null, role: WorkRole | null = null): FillStep[] {
  const steps: FillStep[] = [{ kind: "select", fieldName: "country", label: "Country", required: false, value: [home.country] }];
  if (home.city) {
    const value = home.stateName ? `${home.city}, ${home.stateName}` : home.city;
    steps.push({ kind: "location", fieldName: "candidate-location", label: "Location (City)", required: false, value });
  }
  steps.push({ kind: "check", fieldName: "gdpr_demographic_data_consent_given", label: "Demographic data consent", required: false, value: true });
  for (const [fieldName, label] of EEOC_FIELDS) steps.push({ kind: "decline", fieldName, label, required: false });
  if (school) steps.push(...educationSteps(school));
  if (role) steps.push(...employmentSteps(role));
  return steps;
}

/**
 * Fields the user changed before submitting: steps whose final value differs from what was filled.
 *
 * @param steps - What the runner filled.
 * @param final - Each field's value just before submit, by field name (missing = unknown, not changed).
 */
export function changedFields(steps: FillStep[], final: Record<string, string>): string[] {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const same = (s: FillStep, shown: string) => {
    if (s.kind === "text") return sameText(shown, s.value) || samePlace(shown, s.value);
    if (s.kind === "resume" || s.kind === "check" || s.kind === "decline") return true;
    // A picked option can read longer than what was asked for ("United States" -> "United States +1").
    if (s.kind === "closest") return true;
    const asked = s.kind === "select" ? s.value.join(", ") : s.value;
    return norm(shown).toLowerCase().startsWith(norm(asked).toLowerCase());
  };
  return steps.filter((s) => s.fieldName in final && !same(s, final[s.fieldName])).map((s) => s.label);
}
