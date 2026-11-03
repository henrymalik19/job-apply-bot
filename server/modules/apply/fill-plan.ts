// What the apply runner types into a form: one step per prepared answer, by
// the form's own field name. Pure, so the mapping is tested without a browser.
import type { Json } from "@/server/db/types";
import { DECLINE } from "@/server/integrations/ats/forms";

/** The prepared question fields the plan reads. */
export type PlanQuestion = {
  question: string;
  field_name: string | null;
  field_type: string | null;
  options: Json | null;
  required: boolean;
  answer: string | null;
  answer_value: Json | null;
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

/** The steps in form order, and why the form can't be filled (empty when it can). */
export type FillPlan = { steps: FillStep[]; blockers: string[] };

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
 * @returns Steps for every answered field; blockers for required fields with no usable answer.
 */
export function buildFillPlan(questions: PlanQuestion[]): FillPlan {
  const steps: FillStep[] = [];
  const blockers: string[] = [];
  for (const q of questions) {
    if (!q.field_name || q.field_type === "hidden") continue;
    const base = { fieldName: q.field_name, label: q.question, required: q.required };
    if (q.field_type === "file") {
      if (isResume(q)) steps.push({ kind: "resume", ...base });
      else if (q.required) blockers.push(`"${q.question}" needs a file`);
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
  return { steps, blockers };
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

/**
 * Greenhouse fields that aren't in the job's question list: the phone's Country,
 * "Location (City)", the consent to processing the demographic answers (you
 * agreed to have it ticked), and the self-identification (EEOC) questions, declined
 * (for forms prepared before those were read; Race only shows once Hispanic/Latino is
 * "No", so after a decline it isn't there), and your first education. Not required here: a form without them
 * skips them, and a form that needs them shows the gap when it is checked before submitting.
 */
export function greenhouseExtras(home: HomePlace, school: Schooling | null = null): FillStep[] {
  const steps: FillStep[] = [{ kind: "select", fieldName: "country", label: "Country", required: false, value: [home.country] }];
  if (home.city) {
    const value = home.stateName ? `${home.city}, ${home.stateName}` : home.city;
    steps.push({ kind: "location", fieldName: "candidate-location", label: "Location (City)", required: false, value });
  }
  steps.push({ kind: "check", fieldName: "gdpr_demographic_data_consent_given", label: "Demographic data consent", required: false, value: true });
  for (const [fieldName, label] of EEOC_FIELDS) steps.push({ kind: "decline", fieldName, label, required: false });
  if (school) steps.push(...educationSteps(school));
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
    if (s.kind === "text") return sameText(shown, s.value);
    if (s.kind === "resume" || s.kind === "check" || s.kind === "decline") return true;
    // A picked option can read longer than what was asked for ("United States" -> "United States +1").
    if (s.kind === "closest") return true;
    const asked = s.kind === "select" ? s.value.join(", ") : s.value;
    return norm(shown).toLowerCase().startsWith(norm(asked).toLowerCase());
  };
  return steps.filter((s) => s.fieldName in final && !same(s, final[s.fieldName])).map((s) => s.label);
}
