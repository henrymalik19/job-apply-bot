// Checking a matched answer once clears the same check on your other unsent applications, against a local Supabase:
//   - the same wording matched to the same question is marked checked on other open applications
//   - drafted answers, AI picks (they carry a reason) and sent applications keep theirs
//   - approving an application does the same
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Db } from "@/server/db/types";
import { answerQuestions, approveApplication } from "@/server/modules/applications/applications.service";
import { normalize } from "@/shared/text";
import type {} from "./setup";
import { testUser } from "./users";

const { url: URL, serviceRoleKey: SERVICE } = inject("supabase");
const db = createClient(URL, SERVICE, { auth: { persistSession: false } }) as unknown as Db;

const tag = randomUUID().slice(0, 8);
const sponsor = `Will you require sponsorship ${tag}?`;
const located = `Are you located in the US ${tag}?`;
let userId = "";
let cleanupUser = async () => {};
const jobIds: string[] = [];
const apps: Record<string, string> = {};
const questionIds: Record<string, string> = {};

async function addApp(name: string, status: string) {
  const { data: job } = await db
    .from("jobs")
    .insert({ company_name: `${name} ${tag}`, source: "greenhouse", external_id: `${tag}${name}`, url: `https://example.test/${tag}/${name}`, title: "Engineer", dedup_key: `${tag}-${name}` })
    .select("id")
    .single();
  jobIds.push(job!.id);
  const { data: app } = await db.from("applications").insert({ user_id: userId, job_id: job!.id, status }).select("id").single();
  apps[name] = app!.id;
}

/** A flagged answer on an application; `extra` overrides. */
async function flag(app: string, question: string, questionKey: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await db
    .from("application_questions")
    .insert({
      application_id: apps[app], question, field_name: `${questionKey}_${app}`, field_type: "text", required: true, sort_order: 0,
      bucket: "auto", answer: "No", answer_value: "No", answer_source: "answer", needs_check: true, question_id: questionIds[questionKey], reason: null, ...extra,
    } as never)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data!.id as string;
}

const needsCheck = async (id: string) => (await db.from("application_questions").select("needs_check").eq("id", id).single()).data!.needs_check;

beforeAll(async () => {
  ({ id: userId, cleanup: cleanupUser } = await testUser(db));
  for (const [key, label] of [["sponsor", sponsor], ["located", located]]) {
    const { data: q } = await db.from("questions").insert({ key: `${key}_${tag}`, label, category: "logistics", answer_type: "boolean", answer_source: "answer" }).select("id").single();
    questionIds[key] = q!.id;
    await db.from("question_aliases").insert({ normalized_text: normalize(label), question_id: q!.id, confirmed: false });
  }
  await addApp("here", "queued");
  await addApp("other", "queued");
  await addApp("waiting", "needs_input");
  await addApp("sent", "submitted");
});

afterAll(async () => {
  await db.from("question_aliases").delete().like("normalized_text", `%${tag}%`);
  await db.from("applications").delete().in("id", Object.values(apps));
  await db.from("jobs").delete().in("id", jobIds);
  await db.from("questions").delete().like("label", `%${tag}%`);
  await cleanupUser();
});

describe("checking an answer once", () => {
  it("clears the same check on other unsent applications, and only matched answers", async () => {
    const here = await flag("here", sponsor, "sponsor");
    const other = await flag("other", sponsor, "sponsor");
    const waiting = await flag("waiting", sponsor, "sponsor");
    const picked = await flag("other", sponsor, "sponsor", { field_name: "picked", reason: "picked by AI from your country" });
    const drafted = await flag("waiting", sponsor, "sponsor", { field_name: "drafted", answer_source: "drafted" });
    const sent = await flag("sent", sponsor, "sponsor");
    const unrelated = await flag("other", located, "located");

    const result = await answerQuestions(db, userId, { applicationId: apps.here, answers: [{ questionId: here, answer: "No" }], confirmUnchanged: true });
    expect(result.note).toBe("Marked 1 as checked. Also checked on 2 other applications.");

    expect(await needsCheck(here)).toBe(false);
    expect(await needsCheck(other)).toBe(false);
    expect(await needsCheck(waiting)).toBe(false);
    expect(await needsCheck(picked)).toBe(true);
    expect(await needsCheck(drafted)).toBe(true);
    expect(await needsCheck(sent)).toBe(true);
    expect(await needsCheck(unrelated)).toBe(true);
    const { data: alias } = await db.from("question_aliases").select("confirmed").eq("normalized_text", normalize(sponsor)).single();
    expect(alias!.confirmed).toBe(true);
  });

  it("does the same when an application is approved", async () => {
    await flag("here", located, "located", { field_name: "located_here2" });
    const waiting = await flag("waiting", located, "located");
    await approveApplication(db, userId, apps.here);
    expect(await needsCheck(waiting)).toBe(false);
  });
});
