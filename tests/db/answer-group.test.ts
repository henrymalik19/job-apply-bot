// Saving a group of answers with one Save, against a local Supabase:
//   - only changed answers are saved; blank ones are left alone
//   - short answers are remembered for other forms, free text stays with this application
//   - an unchanged answer marked "please check" is marked checked
//   - once nothing required is left, the application moves to review
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Db } from "@/server/db/types";
import { answerQuestions } from "@/server/modules/applications/applications.service";
import type {} from "./setup";
import { testUser } from "./users";

const { url: URL, serviceRoleKey: SERVICE } = inject("supabase");
const db = createClient(URL, SERVICE, { auth: { persistSession: false } }) as unknown as Db;

const tag = randomUUID().slice(0, 8);
let userId = "";
let cleanupUser = async () => {};
let jobId = "";
let appId = "";
const rows: Record<string, string> = {};

const question = (key: string, extra: Record<string, unknown>, sort: number) => ({
  // Every row has the same columns (a bulk insert sends missing ones as null).
  application_id: appId, question: `${key} question ${tag}?`, field_name: key, field_type: "text", required: true, sort_order: sort,
  options: null, answer: null, answer_value: null, answer_source: null, needs_check: false, ...extra,
});

beforeAll(async () => {
  ({ id: userId, cleanup: cleanupUser } = await testUser(db));
  const { data: job } = await db
    .from("jobs")
    .insert({ company_name: `Groupco ${tag}`, source: "greenhouse", external_id: `${tag}grp`, url: `https://example.test/${tag}/grp`, title: "Engineer", dedup_key: `${tag}-grp` })
    .select("id")
    .single();
  jobId = job!.id;
  const { data: app } = await db.from("applications").insert({ user_id: userId, job_id: jobId, status: "needs_input" }).select("id").single();
  appId = app!.id;
  const { data, error } = await db
    .from("application_questions")
    .insert([
      question("clearance", { field_type: "select", options: [{ label: "Yes", value: "1" }, { label: "No", value: "0" }], bucket: "needs_user" }, 0),
      question("why", { field_type: "textarea", bucket: "needs_user" }, 1),
      question("checkme", { bucket: "auto", answer: "Remote", answer_value: "Remote", answer_source: "answer", needs_check: true }, 2),
      question("untouched", { bucket: "auto", answer: "Atlanta", answer_value: "Atlanta", answer_source: "profile", required: false }, 3),
      question("blank", { bucket: "needs_user", required: false }, 4),
    ] as never)
    .select("id, field_name");
  if (error) throw new Error(error.message);
  for (const r of data!) rows[r.field_name ?? ""] = r.id;
});

afterAll(async () => {
  await db.from("question_aliases").delete().like("normalized_text", `%${tag}%`);
  await db.from("questions").delete().like("label", `%${tag}%`); // saved answers cascade
  await db.from("applications").delete().eq("id", appId);
  await db.from("jobs").delete().eq("id", jobId);
  await cleanupUser();
});

describe("one Save for a group of answers", () => {
  it("saves what changed, marks the checked one, leaves the rest, and moves the application to review", async () => {
    const result = await answerQuestions(db, userId, {
      applicationId: appId,
      answers: [
        { questionId: rows.clearance, answer: "0" },
        { questionId: rows.why, answer: "The work fits." },
        { questionId: rows.checkme, answer: "Remote" },
        { questionId: rows.untouched, answer: "Atlanta" },
        { questionId: rows.blank, answer: "" },
      ],
      confirmUnchanged: true,
    });
    expect(result.movedToReview).toBe(true);
    expect(result.note).toMatch(/Saved 2 answers \(1 remembered for other applications\)\. Marked 1 as checked\./);

    const { data } = await db.from("application_questions").select("field_name, answer, bucket, answer_source, needs_check, question_id").eq("application_id", appId);
    const by = Object.fromEntries(data!.map((r) => [r.field_name, r]));
    expect(by.clearance).toMatchObject({ answer: "No", bucket: "auto", answer_source: "user" });
    expect(by.clearance.question_id).not.toBeNull(); // remembered
    expect(by.why).toMatchObject({ answer: "The work fits.", answer_source: "user", question_id: null }); // stays here
    expect(by.checkme).toMatchObject({ answer: "Remote", needs_check: false, answer_source: "answer" });
    expect(by.untouched).toMatchObject({ answer: "Atlanta", answer_source: "profile" });
    expect(by.blank).toMatchObject({ answer: null, bucket: "needs_user" });
    const { data: app } = await db.from("applications").select("status").eq("id", appId).single();
    expect(app!.status).toBe("queued");
  });

  it("saves an optional answer you cleared as empty, and refuses to empty a required one", async () => {
    const drafted = { field_type: "textarea", bucket: "drafted", answer: "AI text", answer_value: "AI text", answer_source: "drafted", needs_check: true };
    const { data } = await db
      .from("application_questions")
      .insert([question("followup", { ...drafted, required: false }, 5), question("mustsay", drafted, 6)] as never)
      .select("id, field_name");
    const id = Object.fromEntries(data!.map((r) => [r.field_name, r.id]));

    const result = await answerQuestions(db, userId, { applicationId: appId, answers: [{ questionId: id.followup, answer: "  " }, { questionId: rows.blank, answer: "" }] });
    expect(result.note).toBe("Cleared 1 answer; it's sent empty.");
    const { data: row } = await db.from("application_questions").select("answer, bucket, answer_source, needs_check").eq("id", id.followup).single();
    expect(row).toMatchObject({ answer: null, bucket: "auto", answer_source: "user", needs_check: false });

    await expect(answerQuestions(db, userId, { applicationId: appId, answers: [{ questionId: id.mustsay, answer: "" }] })).rejects.toThrow(/required/);
  });
});
