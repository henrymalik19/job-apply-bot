// Answering a profile question by picking from the form's own list (Upstart's "What is your current
// location?" offers "United States" or "Canada (outside of Quebec)") with "save" on: it answers this
// application and leaves the profile's "City, ST" alone, instead of failing to save it there.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Db } from "@/server/db/types";
import { answerQuestion } from "@/server/modules/applications/applications.service";
import type {} from "./setup";
import { testUser } from "./users";

const { url: URL, serviceRoleKey: SERVICE } = inject("supabase");
const db = createClient(URL, SERVICE, { auth: { persistSession: false } }) as unknown as Db;

const tag = randomUUID().slice(0, 8);
let userId = "";
let cleanupUser = async () => {};
let jobId = "";
let appId = "";
let rowId = "";
let profileBefore: { city: string | null; state: string | null } | null = null;

beforeAll(async () => {
  ({ id: userId, cleanup: cleanupUser } = await testUser(db));
  const { data: profile } = await db.from("profiles").select("city, state").eq("user_id", userId).maybeSingle();
  profileBefore = profile;
  const { data: catalog } = await db.from("questions").select("id").eq("key", "current_location").single();
  const { data: job } = await db
    .from("jobs")
    .insert({ company_name: `Upco ${tag}`, source: "greenhouse", external_id: `${tag}loc`, url: `https://example.test/${tag}/loc`, title: "Identity Engineer", dedup_key: `${tag}-loc` })
    .select("id")
    .single();
  jobId = job!.id;
  const { data: app } = await db.from("applications").insert({ user_id: userId, job_id: jobId, status: "needs_input" }).select("id").single();
  appId = app!.id;
  const { data: row, error } = await db
    .from("application_questions")
    .insert({
      application_id: appId,
      question: "What is your current location?",
      field_name: "question_1",
      field_type: "select",
      options: [{ label: "United States", value: "1" }, { label: "Canada (outside of Quebec)", value: "2" }],
      required: true,
      bucket: "needs_user",
      question_id: catalog!.id,
      sort_order: 0,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  rowId = row!.id;
});

afterAll(async () => {
  await db.from("applications").delete().eq("id", appId);
  await db.from("jobs").delete().eq("id", jobId);
  await cleanupUser();
});

describe("answering a profile question from the form's list", () => {
  it("answers it here, moves the application on, and leaves the profile's location alone", async () => {
    const result = await answerQuestion(db, userId, { applicationId: appId, questionId: rowId, answer: "1", save: true });
    expect(result.note).toMatch(/profile is unchanged/);
    expect(result.movedToReview).toBe(true);
    const { data: row } = await db.from("application_questions").select("answer, bucket").eq("id", rowId).single();
    expect(row).toEqual({ answer: "United States", bucket: "auto" });
    const { data: profile } = await db.from("profiles").select("city, state").eq("user_id", userId).maybeSingle();
    expect(profile).toEqual(profileBefore);
  });
});
