// Profile > Saved answers, against a local Supabase: listed with their questions, changed (fitted to
// the question's kind) and deleted.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Db } from "@/server/db/types";
import { deleteSavedAnswer, listSavedAnswers, updateSavedAnswer } from "@/server/modules/questions/saved-answers";
import type {} from "./setup";
import { testUser } from "./users";

const { url: URL, serviceRoleKey: SERVICE } = inject("supabase");
const db = createClient(URL, SERVICE, { auth: { persistSession: false } }) as unknown as Db;
const tag = randomUUID().slice(0, 8);
let userId = "";
let cleanupUser = async () => {};
const ids: Record<string, string> = {};

beforeAll(async () => {
  ({ id: userId, cleanup: cleanupUser } = await testUser(db));
  const { data } = await db
    .from("questions")
    .insert([
      { key: `willing_background_check_${tag}`, label: `Willing to undergo a background check ${tag}?`, category: "other", answer_type: "boolean", answer_source: "answer" },
      { key: `desired_salary_${tag}`, label: `Desired salary ${tag}`, category: "compensation", answer_type: "range", answer_source: "answer" },
    ])
    .select("id, answer_type");
  for (const q of data!) ids[q.answer_type] = q.id;
  await db.from("question_answers").insert([
    { user_id: userId, question_id: ids.boolean, value: true },
    { user_id: userId, question_id: ids.range, value: { min: 120000, max: 150000 } },
  ]);
});

afterAll(async () => {
  await db.from("questions").delete().like("key", `%_${tag}`); // saved answers cascade
  await cleanupUser();
});

describe("saved answers", () => {
  it("lists, changes and deletes your saved answers", async () => {
    const mine = (await listSavedAnswers(db, userId)).filter((a) => a.label.includes(tag));
    expect(mine.map((a) => [a.label.split(" ")[0], a.shown])).toEqual([["Desired", "120,000–150,000"], ["Willing", "Yes"]]);

    await updateSavedAnswer(db, userId, ids.range, "130k - 160k");
    await updateSavedAnswer(db, userId, ids.boolean, "no");
    const after = new Map((await listSavedAnswers(db, userId)).map((a) => [a.questionId, a]));
    expect(after.get(ids.range)?.value).toEqual({ min: 130000, max: 160000 });
    expect(after.get(ids.boolean)?.shown).toBe("No");
    await expect(updateSavedAnswer(db, userId, ids.range, "")).rejects.toThrow(/Enter an answer/);

    await deleteSavedAnswer(db, userId, ids.boolean);
    expect((await listSavedAnswers(db, userId)).some((a) => a.questionId === ids.boolean)).toBe(false);
  });
});
