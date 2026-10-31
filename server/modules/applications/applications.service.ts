// Public API of the applications module. Status only ever changes through
// transition(); the database enforces the allowed moves. Answering a Needs-you
// question can save the answer for reuse (to the profile or the question
// catalog) and moves the application to the review queue once nothing
// required is left (a saved answer also fills the same question on the user's
// other waiting applications); approving confirms the question mappings it used.
import { z } from "zod";
import type { Db, Json } from "@/server/db/types";
import { ValidationError } from "@/server/core/errors";
import { addLesson } from "@/server/modules/lessons/lessons.service";
import { saveProfileAnswer } from "@/server/modules/profile/profile.service";
import type { FormQuestion } from "@/server/integrations/ats/forms";
import { shapeAnswer, type AnswerValue } from "@/server/modules/prepare/answers";
import { confirmAlias, ensureQuestion, insertAlias, listAliases, listQuestions, saveAnswer, type Question } from "@/server/modules/questions/questions.service";
import { normalize } from "@/shared/text";
import {
  getApplication,
  listOpenQuestions,
  transition,
  updateQuestion,
  type ApplicationQuestion,
  type ApplicationWithDetails,
} from "./applications.repository";
import type { AppStatus } from "./application-status";

export {
  countByStatus,
  getApplication,
  IllegalTransitionError,
  listApplications,
  transition,
  type Application,
  type ApplicationJob,
  type ApplicationQuestion,
  type ApplicationWithDetails,
} from "./applications.repository";
export * from "./application-status";

/** Statuses on the Review page. */
export const REVIEW_STATUSES: readonly AppStatus[] = ["queued"];

/** An option of a select question, as stored on `application_questions.options`. */
export type QuestionOption = { label: string; value: string; decline?: boolean };

/** Required questions still blocking an application. */
export function blockingQuestions(app: Pick<ApplicationWithDetails, "questions">): ApplicationQuestion[] {
  return app.questions.filter((q) => q.required && (q.bucket === "needs_user" || q.bucket === "cannot_automate"));
}

/** The answer a form takes, from what was typed or picked. */
function parseAnswer(q: ApplicationQuestion, raw: string): { answer: string; value: Json } {
  const text = raw.trim();
  if (!text) throw new ValidationError("Enter an answer.");
  const options = (q.options as QuestionOption[] | null) ?? [];
  if (q.field_type === "select" || q.field_type === "multiselect") {
    const option = options.find((o) => o.value === text);
    if (!option) throw new ValidationError("Pick one of the options.");
    return { answer: option.label, value: q.field_type === "multiselect" ? [option.value] : option.value };
  }
  if (q.field_type === "boolean") {
    if (text !== "yes" && text !== "no") throw new ValidationError("Pick yes or no.");
    return { answer: text === "yes" ? "Yes" : "No", value: text === "yes" };
  }
  return { answer: text, value: text };
}

/** A typed answer as a catalog question stores it (so the next form can fit it to its own options). */
function storedValue(question: Pick<Question, "answer_type">, answer: string): NonNullable<Json> {
  switch (question.answer_type) {
    case "boolean":
      return /^(yes|true|y)\b/i.test(answer.trim());
    case "number": {
      const n = Number(answer.replace(/[^0-9.]/g, ""));
      if (!Number.isFinite(n)) throw new ValidationError("Enter a number to save it.");
      return n;
    }
    case "range": {
      const nums = [...answer.replace(/,/g, "").matchAll(/(\d+(?:\.\d+)?)\s*(k)?/gi)].map((m) => Number(m[1]) * (m[2] ? 1000 : 1));
      if (nums.length === 0) throw new ValidationError("Enter a number or range to save it.");
      return { min: nums[0], max: nums[1] ?? nums[0] };
    }
    default:
      return answer;
  }
}

const answerType = (fieldType: string | null) => (fieldType === "boolean" ? "boolean" : fieldType?.includes("select") ? "choice" : "text");
const questionKey = (label: string) => normalize(label).replace(/ /g, "_").slice(0, 60) || "question";

/**
 * Saves an answer for reuse: to the profile for contact questions, to the
 * question's stored answer, or (for a question the catalog doesn't know) as a
 * new catalog question with this wording as a confirmed alias.
 *
 * @returns Where it was saved, or a hint where to change it instead.
 */
async function saveForReuse(db: Db, userId: string, q: ApplicationQuestion, answer: string): Promise<{ questionId: string | null; note: string }> {
  const catalog = q.question_id ? (await listQuestions(db)).find((c) => c.id === q.question_id) : undefined;
  if (catalog?.answer_source === "profile") {
    return (await saveProfileAnswer(db, userId, catalog.key, answer))
      ? { questionId: catalog.id, note: "Saved to your profile." }
      : { questionId: catalog.id, note: "Answered here only; change it on your Profile page to reuse it." };
  }
  if (catalog?.answer_source === "criteria") return { questionId: catalog.id, note: "Answered here only; change it on the Search page to reuse it." };
  if (catalog?.answer_source === "skill_years") return { questionId: catalog.id, note: "Answered here only; set the years on your Profile page to reuse it." };
  if (catalog && catalog.answer_source !== "answer") return { questionId: catalog.id, note: "Answered here only." };
  const question = catalog ?? (await ensureQuestion(db, { key: questionKey(q.question), label: q.question, category: "other", answer_type: answerType(q.field_type) }));
  const value = storedValue(question, answer);
  await saveAnswer(db, userId, question.id, value);
  await insertAlias(db, { normalized_text: normalize(q.question), question_id: question.id, confirmed: true });
  const filled = await fillWaiting(db, userId, q, question.id, value);
  const elsewhere = filled > 0 ? ` Also filled on ${filled} other waiting application${filled === 1 ? "" : "s"}.` : "";
  return { questionId: question.id, note: `Saved; it fills in automatically on the next form that asks.${elsewhere}` };
}

/** Statuses whose unanswered questions a saved answer fills straight away. */
const WAITING: readonly AppStatus[] = ["needs_input", "queued", "manual"];

/**
 * Fills a just-saved answer into the same question on the user's other
 * waiting applications: the same wording, or a wording mapped to the same
 * catalog question (flipped when it asks the opposite). An application left
 * with no required blockers moves to review.
 *
 * @returns How many questions were filled.
 */
async function fillWaiting(db: Db, userId: string, source: ApplicationQuestion, questionId: string, value: NonNullable<Json>): Promise<number> {
  const open = (await listOpenQuestions(db, userId, WAITING)).filter((r) => r.id !== source.id);
  if (open.length === 0) return 0;
  const aliases = await listAliases(db);
  const wording = normalize(source.question);
  const touched = new Set<string>();
  let filled = 0;
  for (const row of open) {
    const text = normalize(row.question);
    const alias = aliases.get(text);
    if (text !== wording && alias?.question_id !== questionId) continue;
    const inverted = text !== wording && alias?.polarity === "inverted";
    const options = (row.options as QuestionOption[] | null) ?? [];
    const shaped = shapeAnswer({ fieldType: (row.field_type ?? "text") as FormQuestion["fieldType"], options }, value as AnswerValue, inverted);
    if (!shaped) continue;
    await updateQuestion(db, row.id, {
      answer: shaped.answer, answer_value: shaped.value as Json, bucket: "auto", answer_source: "answer", question_id: questionId,
      needs_check: text !== wording && !alias?.confirmed, reason: null,
    });
    touched.add(row.applications.id);
    filled++;
  }
  for (const id of touched) {
    const app = await getApplication(db, userId, id);
    if (app?.status === "needs_input" && blockingQuestions(app).length === 0) await transition(db, id, "queued", "user:answer");
  }
  return filled;
}

const answerInput = z.object({ applicationId: z.string().uuid(), questionId: z.string().uuid(), answer: z.string(), save: z.boolean() });

/**
 * Answers one question of an application (Needs you, or an edit on review).
 * With `save`, the answer is stored for reuse. When the last required blocker
 * of a Needs-you application is answered, it moves to the review queue.
 *
 * @returns A short note for the owner, and whether the application moved to review.
 * @throws {@link ValidationError} for an empty answer or an option that isn't offered.
 */
export async function answerQuestion(
  db: Db,
  userId: string,
  input: { applicationId: string; questionId: string; answer: string; save: boolean; lesson?: string },
): Promise<{ note: string; movedToReview: boolean }> {
  const { applicationId, questionId, answer: raw, save } = answerInput.parse(input);
  const app = await getApplication(db, userId, applicationId);
  const q = app?.questions.find((x) => x.id === questionId);
  if (!app || !q) throw new ValidationError("That question is gone; reload the page.");
  const { answer, value } = parseAnswer(q, raw);
  const reuse = save ? await saveForReuse(db, userId, q, answer) : { questionId: q.question_id, note: "Saved for this application." };
  await updateQuestion(db, q.id, {
    answer, answer_value: value, bucket: "auto", answer_source: "user", user_approved: true, needs_check: false, reason: null,
    question_id: reuse.questionId,
  });
  if (input.lesson?.trim()) {
    await addLesson(db, userId, { rule: input.lesson, scope: "answers", source: `Answering "${q.question}" for ${app.job.title} at ${app.job.company_name}` });
  }

  const stillBlocked = blockingQuestions({ questions: app.questions.filter((x) => x.id !== q.id) });
  const movedToReview = app.status === "needs_input" && stillBlocked.length === 0;
  if (movedToReview) await transition(db, app.id, "queued", "user:answer");
  return { note: reuse.note, movedToReview };
}

/**
 * Approves a queued application, which confirms the question wordings its
 * answers were matched by (they stop showing "please check").
 */
export async function approveApplication(db: Db, userId: string, applicationId: string): Promise<void> {
  const app = await getApplication(db, userId, z.string().uuid().parse(applicationId));
  if (!app) throw new ValidationError("That application is gone.");
  await transition(db, app.id, "approved", "user:approve");
  for (const q of app.questions.filter((x) => x.needs_check && x.question_id && x.answer_source !== "drafted")) {
    await confirmAlias(db, normalize(q.question));
  }
}

/** Skips an application with an optional reason, saved as a lesson when one is given. */
export async function skipApplication(
  db: Db,
  userId: string,
  applicationId: string,
  input: { reason?: string; lesson?: string; lessonScope?: string },
): Promise<void> {
  const app = await getApplication(db, userId, z.string().uuid().parse(applicationId));
  if (!app) throw new ValidationError("That application is gone.");
  const reason = input.reason?.trim().slice(0, 500) || null;
  await transition(db, app.id, "skipped", "user:skip", reason ? { reason } : undefined);
  if (input.lesson?.trim()) {
    await addLesson(db, userId, { rule: input.lesson, scope: input.lessonScope ?? "scoring", source: `Skipped ${app.job.title} at ${app.job.company_name}` });
  }
}
