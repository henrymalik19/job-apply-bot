// Questions the apply runner found going through a form in pages (LinkedIn Easy Apply), which shows its
// questions only inside the form. Saved on the application like a prepared form's questions:
//   - one it had no answer for is a question for you (Needs you)
//   - one LinkedIn had filled in differently from your profile is answered with your profile's, with
//     LinkedIn's as the other choice, to double-check
//   - one Claude answered from your profile on the way is answered, to double-check
// The application goes back to Needs you or Ready to review; once you approve it again the runner fills
// the form with these answers.
import { z } from "zod";
import type { Db, Json } from "@/server/db/types";
import { unwrap } from "@/server/core/errors";
import { ValidationError } from "@/server/core/errors";
import { transition } from "@/server/modules/applications/applications.repository";
import { recheckOpenQuestions } from "@/server/modules/prepare/prepare.service";
import type { StructuredCall } from "@/server/integrations/anthropic/claude";
import type { QuestionToAsk } from "./apply.service";

/** One question as the runner sends it. */
export const questionToAskSchema = z.object({
  key: z.string().min(1).max(2100),
  label: z.string().min(1).max(2000),
  kind: z.enum(["text", "textarea", "select", "multiselect", "combobox", "agreement"]),
  options: z.array(z.string().max(1000)).max(200),
  required: z.boolean(),
  answer: z.array(z.string().max(5000)).max(50).optional(),
  conflict: z.object({ form: z.string().max(5000), yours: z.string().max(5000) }).optional(),
});

const fieldType = (kind: QuestionToAsk["kind"]) => (kind === "select" || kind === "multiselect" ? kind : kind === "textarea" ? "textarea" : "text");
const asOptions = (labels: string[]) => [...new Set(labels.filter(Boolean))].map((label) => ({ label, value: label }));

/** A question as an application_questions row (every key present: a bulk insert sends null for missing ones). */
function rowFor(applicationId: string, q: QuestionToAsk, sortOrder: number) {
  const base = {
    application_id: applicationId,
    question: q.label,
    field_name: q.key,
    field_type: fieldType(q.kind),
    description: null,
    options: asOptions(q.options) as Json,
    required: q.required,
    sort_order: sortOrder,
    bucket: "needs_user",
    answer: null as string | null,
    answer_value: null as Json | null,
    answer_source: null as string | null,
    question_id: null,
    needs_check: false,
    reason: "Asked in LinkedIn's Easy Apply form; the runner had no answer for it." as string | null,
  };
  if (q.conflict) {
    // Your profile's answer goes in unless you pick LinkedIn's.
    return {
      ...base,
      field_type: "select",
      options: asOptions([q.conflict.yours, q.conflict.form]) as Json,
      bucket: "auto",
      answer: q.conflict.yours,
      answer_value: q.conflict.yours,
      answer_source: "linkedin",
      needs_check: true,
      reason: `LinkedIn had "${q.conflict.form}" filled in from an application before; your profile says "${q.conflict.yours}". Pick which to send.`,
    };
  }
  if (q.answer?.length) {
    return {
      ...base,
      bucket: "auto",
      answer: q.answer.join(", "),
      answer_value: (q.kind === "multiselect" ? q.answer : q.answer[0]) as Json,
      answer_source: "profile",
      needs_check: true,
      reason: "picked by AI from your profile while going through the LinkedIn form",
    };
  }
  return base;
}

/**
 * Saves the questions the runner found on an approved application's form, and sends it back to you:
 * Needs you while a required one has no answer, else Ready to review. The open ones are then sorted like
 * a prepared form's (an answer you saved for another form, or your profile, answers them), with Claude when given.
 *
 * @param db - The user's own client (as the runner signs in).
 * @returns The application's status now.
 */
export async function saveFormQuestions(db: Db, userId: string, applicationId: string, questions: QuestionToAsk[], call?: StructuredCall): Promise<string> {
  const app = unwrap(await db.from("applications").select("id, status, jobs!inner(source)").eq("id", applicationId).eq("user_id", userId).maybeSingle(), "read application");
  if (!app) throw new ValidationError("No such application.");
  if (app.status !== "approved") throw new ValidationError("Only an approved application takes questions from its form.");

  const asked = questions.filter((q) => q.kind !== "agreement");
  const keys = asked.map((q) => q.key);
  // Asked again: the new question replaces the old one.
  if (keys.length) unwrap(await db.from("application_questions").delete().eq("application_id", applicationId).in("field_name", keys).select("id"), "replace questions");
  const last = unwrap(await db.from("application_questions").select("sort_order").eq("application_id", applicationId).order("sort_order", { ascending: false }).limit(1), "read question order");
  const start = (last[0]?.sort_order ?? -1) + 1;
  const rows = asked.map((q, i) => rowFor(applicationId, q, start + i));
  if (rows.length) unwrap(await db.from("application_questions").insert(rows).select("id"), "save form questions");

  const open = rows.some((r) => r.required && r.bucket === "needs_user");
  await transition(db, applicationId, open ? "needs_input" : "queued", "worker:form_questions", { questions: rows.length });
  // Open ones a saved answer or your profile can answer are answered; it moves to Ready to review when none are left.
  if (open) await recheckOpenQuestions({ db, userId, call }, { applicationIds: [applicationId] }).catch(() => undefined);
  const now = unwrap(await db.from("applications").select("status").eq("id", applicationId).single(), "read status");
  return now.status;
}
