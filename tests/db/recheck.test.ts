// Rechecking the open questions of waiting applications, against a local Supabase:
//   - a wording already known is answered from a saved answer, without asking Claude
//   - an "only you can do it" step Claude now sorts as a saved-answer question becomes one you answer here
//   - an application with nothing required left moves to Ready to review
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Db } from "@/server/db/types";
import type { StructuredCall } from "@/server/integrations/anthropic/claude";
import { recheckOpenQuestions } from "@/server/modules/prepare/prepare.service";
import type {} from "./setup";
import { setUserSettings, testUser } from "./users";

const { url: URL, serviceRoleKey: SERVICE } = inject("supabase");
const db = createClient(URL, SERVICE, { auth: { persistSession: false } }) as unknown as Db;
const tag = randomUUID().slice(0, 8);
let userId = "";
let cleanupUser = async () => {};
let restoreSettings = async () => {};
const jobIds: string[] = [];
const apps: Record<string, string> = {};
const yesNo = [{ label: "Yes", value: "1" }, { label: "No", value: "0" }];
const relocate = `Are you open to relocating ${tag}?`;
const background = `Are you willing to undergo a background check ${tag}?`;
const asked: string[][] = [];
let relocateId = "";

// Claude: the background check is a standing consent, one saved answer for every employer.
const call: StructuredCall = async ({ user }) => {
  const indexes = [...user.matchAll(/^\[(\d+)\]/gm)].map(([, i]) => Number(i));
  asked.push(indexes.map(String));
  return {
    output: {
      questions: indexes.map((index) => ({
        index, kind: "catalog", question_key: null,
        new_question: { key: `willing_background_check_${tag}`, label: background, category: "other", answer_type: "boolean" },
        skill: null, polarity: "same", confidence: 0.95, qualification_answer: "unknown", supporting_facts: [], reason: "a standing consent",
      })),
    } as never,
    model: "claude-haiku-5-5",
    usage: { input_tokens: 300, output_tokens: 60 },
  };
};

async function addApp(key: string, questions: Record<string, unknown>[], status = "needs_input") {
  const { data: job } = await db
    .from("jobs")
    .insert({ company_name: `Recheckco ${tag}`, source: "greenhouse", external_id: `${tag}${key}`, url: `https://example.test/${tag}/${key}`, title: "Engineer", dedup_key: `${tag}-${key}` })
    .select("id")
    .single();
  jobIds.push(job!.id);
  const { data: app } = await db.from("applications").insert({ user_id: userId, job_id: job!.id, status }).select("id").single();
  apps[key] = app!.id;
  const base = { application_id: app!.id, field_type: "select", options: yesNo, required: true, answer: null, answer_value: null, answer_source: null, needs_check: false, question_id: null };
  const { error } = await db.from("application_questions").insert(questions.map((q, i) => ({ ...base, sort_order: i, ...q })) as never);
  if (error) throw new Error(error.message);
}

beforeAll(async () => {
  ({ id: userId, cleanup: cleanupUser } = await testUser(db));
  restoreSettings = await setUserSettings(db, userId, { llm_monthly_cap_usd: 1000 });
  // A question already known by its wording, with your saved answer.
  const { data: q } = await db.from("questions").insert({ key: `open_to_relocate_${tag}`, label: relocate, category: "logistics", answer_type: "boolean", answer_source: "answer" }).select("id").single();
  await db.from("question_aliases").insert({ normalized_text: relocate.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim(), question_id: q!.id, confirmed: true });
  await db.from("question_answers").insert({ user_id: userId, question_id: q!.id, value: false });
  relocateId = q!.id;
  await addApp("both", [
    { question: relocate, field_name: "q1", bucket: "needs_user", reason: "not answered then" },
    { question: background, field_name: "q2", bucket: "cannot_automate", reason: "Background check consent requires a live candidate action" },
  ]);
  await addApp("known", [{ question: relocate, field_name: "q1", bucket: "needs_user", reason: "not answered then" }]);
  // Answered from your saved answer back when it was Yes; it's No now.
  await addApp("stale", [{ question: relocate, field_name: "q1", bucket: "auto", answer: "Yes", answer_value: "1", answer_source: "answer", question_id: relocateId }], "queued");
});

afterAll(async () => {
  await db.from("applications").delete().in("job_id", jobIds);
  await db.from("jobs").delete().in("id", jobIds);
  await db.from("question_aliases").delete().like("normalized_text", `%${tag}%`);
  await db.from("questions").delete().like("key", `%_${tag}`);
  await db.from("llm_calls").delete().eq("user_id", userId);
  await restoreSettings();
  await cleanupUser();
});

describe("recheck open questions", () => {
  it("answers known wordings, turns a step into a question you can answer, and moves what's done to review", async () => {
    const counts = await recheckOpenQuestions({ db, userId, call }, { applicationIds: Object.values(apps) });
    expect(counts).toMatchObject({ applications: 3, answered: 2, answerable: 1, movedToReview: 1, refreshed: 1 });
    // Only the unknown wording went to Claude, once.
    expect(asked).toHaveLength(1);

    const { data: both } = await db.from("application_questions").select("field_name, answer, bucket, question_id").eq("application_id", apps.both).order("sort_order");
    expect(both![0]).toMatchObject({ answer: "No", bucket: "auto" });
    expect(both![1]).toMatchObject({ answer: null, bucket: "needs_user" });
    expect(both![1].question_id).not.toBeNull(); // answering it saves for every form that asks
    const status = async (id: string) => (await db.from("applications").select("status").eq("id", id).single()).data!.status;
    expect(await status(apps.both)).toBe("needs_input");
    expect(await status(apps.known)).toBe("queued");
    const { data: stale } = await db.from("application_questions").select("answer, answer_value").eq("application_id", apps.stale).single();
    expect(stale).toEqual({ answer: "No", answer_value: "0" });
  });
});
