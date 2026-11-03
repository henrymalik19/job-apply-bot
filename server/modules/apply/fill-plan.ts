// What the apply runner types into a form: one step per prepared answer, by
// the form's own field name. Pure, so the mapping is tested without a browser.
import type { Json } from "@/server/db/types";

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
 * or a checkbox ticked.
 */
export type FillStep =
  | { kind: "text"; fieldName: string; label: string; required: boolean; value: string }
  | { kind: "select"; fieldName: string; label: string; required: boolean; value: string[] }
  | { kind: "location"; fieldName: string; label: string; required: boolean; value: string }
  | { kind: "check"; fieldName: string; label: string; required: boolean; value: true }
  | { kind: "resume"; fieldName: string; label: string; required: boolean };

/** The steps in form order, and why the form can't be filled (empty when it can). */
export type FillPlan = { steps: FillStep[]; blockers: string[] };

const isResume = (q: PlanQuestion) => /resume|cv/i.test(`${q.field_name} ${q.question}`);

/** Option labels for the chosen values of a select (answer_value holds option values). */
function chosenLabels(q: PlanQuestion): string[] {
  const options = Array.isArray(q.options) ? (q.options as { label: string; value: string }[]) : [];
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

/** Where you live, from your profile, for form fields the ATS adds outside its question list. */
export type HomePlace = { city: string | null; stateName: string | null; country: string };

/**
 * Greenhouse fields that aren't in the job's question list: the phone's Country,
 * "Location (City)" and the consent to processing the demographic answers (you
 * agreed to have it ticked). Not required here: a form without them skips them, and a
 * form that needs them shows the gap when it is checked before submitting.
 */
export function greenhouseExtras(home: HomePlace): FillStep[] {
  const steps: FillStep[] = [{ kind: "select", fieldName: "country", label: "Country", required: false, value: [home.country] }];
  if (home.city) {
    const value = home.stateName ? `${home.city}, ${home.stateName}` : home.city;
    steps.push({ kind: "location", fieldName: "candidate-location", label: "Location (City)", required: false, value });
  }
  steps.push({ kind: "check", fieldName: "gdpr_demographic_data_consent_given", label: "Demographic data consent", required: false, value: true });
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
    if (s.kind === "resume" || s.kind === "check") return true;
    // A picked option can read longer than what was asked for ("United States" -> "United States +1").
    const asked = s.kind === "select" ? s.value.join(", ") : s.value;
    return norm(shown).toLowerCase().startsWith(norm(asked).toLowerCase());
  };
  return steps.filter((s) => s.fieldName in final && !same(s, final[s.fieldName])).map((s) => s.label);
}
