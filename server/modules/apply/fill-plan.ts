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

/** One field to fill: text typed, option labels picked, or the resume attached. */
export type FillStep =
  | { kind: "text"; fieldName: string; label: string; required: boolean; value: string }
  | { kind: "select"; fieldName: string; label: string; required: boolean; value: string[] }
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
 * Fields the user changed before submitting: steps whose final value differs from what was filled.
 *
 * @param steps - What the runner filled.
 * @param final - Each field's value just before submit, by field name (missing = unknown, not changed).
 */
export function changedFields(steps: FillStep[], final: Record<string, string>): string[] {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const filled = (s: FillStep) => (s.kind === "text" ? s.value : s.kind === "select" ? s.value.join(", ") : null);
  return steps
    .filter((s) => s.kind !== "resume" && s.fieldName in final && norm(final[s.fieldName]) !== norm(filled(s) ?? ""))
    .map((s) => s.label);
}
