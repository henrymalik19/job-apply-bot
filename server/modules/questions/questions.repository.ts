import type { Db, Insert, Json, Row } from "@/server/db/types";
import { check, unwrap } from "@/server/core/errors";

/** A catalog question: what forms ask and where its answer lives. */
export type Question = Row<"questions">;
/** A wording seen on a form, pointing at its question. */
export type QuestionAlias = Row<"question_aliases">;

/** The whole question catalog. */
export async function listQuestions(db: Db): Promise<Question[]> {
  return unwrap(await db.from("questions").select("*").order("key"), "list questions");
}

/** Every known wording, keyed by normalized text. */
export async function listAliases(db: Db): Promise<Map<string, QuestionAlias>> {
  const rows: QuestionAlias[] = [];
  for (let from = 0; ; from += 1000) {
    const page = unwrap(await db.from("question_aliases").select("*").order("normalized_text").range(from, from + 999), "list question aliases");
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return new Map(rows.map((a) => [a.normalized_text, a]));
}

/** A user's stored answers, keyed by question id. */
export async function listAnswers(db: Db, userId: string): Promise<Map<string, Json>> {
  const rows = unwrap(await db.from("question_answers").select("question_id, value").eq("user_id", userId), "list answers");
  return new Map(rows.map((a) => [a.question_id, a.value]));
}

/** Adds a catalog question answered from the answers table, or returns the existing one with the same key. */
export async function ensureQuestion(
  db: Db,
  question: Pick<Insert<"questions">, "key" | "label" | "category" | "answer_type">,
): Promise<Question> {
  check(
    await db.from("questions").upsert({ ...question, answer_source: "answer" }, { onConflict: "key", ignoreDuplicates: true }),
    "add question",
  );
  return unwrap(await db.from("questions").select("*").eq("key", question.key).single(), "read question");
}

/** Records a wording → question mapping; an existing mapping is left alone. */
export async function insertAlias(db: Db, alias: Insert<"question_aliases">): Promise<void> {
  check(await db.from("question_aliases").upsert(alias, { onConflict: "normalized_text", ignoreDuplicates: true }), "add question alias");
}

/** Saves a user's answer to a catalog question. */
export async function saveAnswer(db: Db, userId: string, questionId: string, value: NonNullable<Json>): Promise<void> {
  check(await db.from("question_answers").upsert({ user_id: userId, question_id: questionId, value }), "save answer");
}

/** Marks a wording's mapping as confirmed by a user (answers from it stop showing "please check"). */
export async function confirmAlias(db: Db, normalizedText: string): Promise<void> {
  check(await db.from("question_aliases").update({ confirmed: true }).eq("normalized_text", normalizedText), "confirm question alias");
}
