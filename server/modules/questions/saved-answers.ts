// Your saved answers: what you've answered once for questions asked the same way everywhere ("Willing to
// undergo a background check?", "How did you hear about us?"), reused on every form that asks. Profile >
// Saved answers lists them to check, change or delete.
import { z } from "zod";
import type { Db, Json } from "@/server/db/types";
import { check, unwrap, ValidationError } from "@/server/core/errors";
import { storedValue } from "@/server/modules/applications/applications.service";

/** One saved answer, with its question. */
export type SavedAnswer = {
  questionId: string;
  label: string;
  category: string;
  answerType: string;
  value: Json;
  /** The answer as you'd read it ("Yes", "$120,000–$150,000"). */
  shown: string;
  /** How it's edited: a Yes/No pick, a number, a range, or a short or long text. */
  kind: AnswerKind;
  updatedAt: string;
};

/** How a saved answer is edited. */
export type AnswerKind = "yes_no" | "number" | "range" | "short" | "long";

/** A text answer longer than this (or on several lines) gets a box of several rows. */
const LONG_TEXT = 80;

/** How an answer is edited: by its question's type, and for text, by what was answered ("Yes" is a Yes/No). */
export function answerKind(answerType: string, shown: string): AnswerKind {
  if (answerType === "boolean" || /^(yes|no)$/i.test(shown.trim())) return "yes_no";
  if (answerType === "number") return "number";
  if (answerType === "range") return "range";
  return shown.length > LONG_TEXT || /\n/.test(shown) ? "long" : "short";
}

/** An answer as you'd read it. */
export function shownAnswer(answerType: string, value: Json): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value && typeof value === "object" && !Array.isArray(value) && "min" in value) {
    const { min, max } = value as { min: number; max: number };
    return min === max ? min.toLocaleString() : `${min.toLocaleString()}–${max.toLocaleString()}`;
  }
  if (Array.isArray(value)) return value.join(", ");
  return value == null ? "" : String(value);
}

/** Your saved answers, by question label. */
export async function listSavedAnswers(db: Db, userId: string): Promise<SavedAnswer[]> {
  const rows = unwrap(
    await db.from("question_answers").select("question_id, value, updated_at, questions!inner(label, category, answer_type)").eq("user_id", userId),
    "list saved answers",
  ) as unknown as { question_id: string; value: Json; updated_at: string; questions: { label: string; category: string; answer_type: string } }[];
  return rows
    .map((r) => ({
      ...(() => {
        const shown = shownAnswer(r.questions.answer_type, r.value);
        return { shown, kind: answerKind(r.questions.answer_type, shown) };
      })(),
      questionId: r.question_id,
      label: r.questions.label,
      category: r.questions.category,
      answerType: r.questions.answer_type,
      value: r.value,
      updatedAt: r.updated_at,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

const id = z.string().uuid();

/**
 * Changes one saved answer; the next form that asks fills in the new one.
 *
 * @throws {@link ValidationError} for an empty answer, or one that doesn't fit the question (a number, a range).
 */
export async function updateSavedAnswer(db: Db, userId: string, questionId: string, raw: string): Promise<void> {
  if (!raw.trim()) throw new ValidationError("Enter an answer, or delete it.");
  const question = unwrap(await db.from("questions").select("answer_type").eq("id", id.parse(questionId)).single(), "read question");
  const value = storedValue(question, raw);
  check(await db.from("question_answers").update({ value }).eq("user_id", userId).eq("question_id", questionId), "update saved answer");
}

/** Deletes one saved answer: forms that ask it go back to asking you. */
export async function deleteSavedAnswer(db: Db, userId: string, questionId: string): Promise<void> {
  check(await db.from("question_answers").delete().eq("user_id", userId).eq("question_id", id.parse(questionId)), "delete saved answer");
}
