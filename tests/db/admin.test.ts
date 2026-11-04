// Admin reads another user's data (with the service-role client adminContext hands out):
//   - Users lists them with their name and application counts
//   - any application opens with its questions and whose it is
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Db } from "@/server/db/types";
import { getAnyApplication, getUserProfile, listUsers } from "@/server/modules/admin/admin.service";
import type {} from "./setup";

const { url: URL, serviceRoleKey: SERVICE } = inject("supabase");
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } }) as unknown as Db;

const tag = randomUUID().slice(0, 8);
const memberId = randomUUID();
let jobId = "";
let appId = "";

beforeAll(async () => {
  const user = await admin.from("users").insert({ id: memberId, role: "member" });
  if (user.error) throw new Error(user.error.message);
  await admin.from("profiles").insert({ user_id: memberId, first_name: "Grace", last_name: `Hopper ${tag}`, email: `grace-${tag}@example.test` });
  const { data: job } = await admin
    .from("jobs")
    .insert({ company_name: `Navyco ${tag}`, source: "greenhouse", external_id: `${tag}adm`, url: `https://example.test/${tag}/adm`, title: "Compiler Engineer", dedup_key: `${tag}-admin` })
    .select("id")
    .single();
  jobId = job!.id;
  const { data: app, error } = await admin.from("applications").insert({ user_id: memberId, job_id: jobId, status: "approved" }).select("id").single();
  if (error) throw new Error(error.message);
  appId = app!.id;
  await admin.from("application_questions").insert({ application_id: appId, question: "First Name", field_name: "first_name", field_type: "text", answer: "Grace", bucket: "auto", required: true, sort_order: 0 });
});

afterAll(async () => {
  await admin.from("applications").delete().eq("id", appId);
  await admin.from("jobs").delete().eq("id", jobId);
  await admin.from("profiles").delete().eq("user_id", memberId);
  await admin.from("users").delete().eq("id", memberId);
});

describe("admin", () => {
  it("lists every user with their name and where their applications stand", async () => {
    const grace = (await listUsers(admin)).find((u) => u.id === memberId);
    expect(grace).toMatchObject({ name: `Grace Hopper ${tag}`, email: `grace-${tag}@example.test`, role: "member", total: 1, counts: { approved: 1 } });
  });

  it("opens another user's application and profile", async () => {
    const found = await getAnyApplication(admin, appId);
    expect(found?.userId).toBe(memberId);
    expect(found?.app.job.title).toBe("Compiler Engineer");
    expect(found?.app.questions.map((q) => [q.question, q.answer])).toEqual([["First Name", "Grace"]]);
    expect((await getUserProfile(admin, memberId))?.first_name).toBe("Grace");
    expect(await getAnyApplication(admin, randomUUID())).toBeNull();
  });
});
