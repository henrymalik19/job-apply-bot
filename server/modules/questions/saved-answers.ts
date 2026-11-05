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
  updatedAt: string;
};

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
      questionId: r.question_id,
      label: r.questions.label,
      category: r.questions.category,
      answerType: r.questions.answer_type,
      value: r.value,
      shown: shownAnswer(r.questions.answer_type, r.value),
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
