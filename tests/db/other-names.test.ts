// Linking an email by hand teaches the company's other name, against a local Supabase:
//   - the sender's name (without "Hiring Team") is saved on the company
//   - a name that's just the company's own adds nothing
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Db } from "@/server/db/types";
import { linkEmail } from "@/server/modules/tracking/tracking.service";
import type {} from "./setup";
import { testUser } from "./users";

const { url: URL, serviceRoleKey: SERVICE } = inject("supabase");
const db = createClient(URL, SERVICE, { auth: { persistSession: false } }) as unknown as Db;
const tag = randomUUID().slice(0, 8);
let userId = "";
let cleanupUser = async () => {};
let companyId = "";
let jobId = "";
let appId = "";

async function email(from: string) {
  const { data, error } = await db
    .from("emails")
    .insert({ user_id: userId, message_id: `<${randomUUID()}@test>`, from_addr: from, subject: "Thanks for applying", snippet: "We got it.", classification: "confirmation", received_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data!.id as string;
}

beforeAll(async () => {
  ({ id: userId, cleanup: cleanupUser } = await testUser(db));
  const { data: company } = await db.from("companies").insert({ name: `Oneapp${tag}`, ats: "ashby", board_token: `oneapp${tag}` }).select("id").single();
  companyId = company!.id;
  const { data: job } = await db
    .from("jobs")
    .insert({ company_id: companyId, company_name: `Oneapp${tag}`, source: "ashby", external_id: `${tag}cc`, url: `https://example.test/${tag}/cc`, title: "Software Engineer, Credit Card", dedup_key: `${tag}-cc` })
    .select("id")
    .single();
  jobId = job!.id;
  const { data: app } = await db.from("applications").insert({ user_id: userId, job_id: jobId, status: "submitted", submitted_at: new Date().toISOString() }).select("id").single();
  appId = app!.id;
});

afterAll(async () => {
  await db.from("emails").delete().eq("user_id", userId);
  await db.from("applications").delete().eq("id", appId);
  await db.from("jobs").delete().eq("id", jobId);
  await db.from("companies").delete().eq("id", companyId);
  await cleanupUser();
});

describe("linking an email by hand", () => {
  it("remembers the name the company's email came under", async () => {
    await linkEmail(db, userId, await email(`Onepay${tag} Hiring Team <no-reply@ashbyhq.com>`), appId);
    await linkEmail(db, userId, await email(`Oneapp${tag} Recruiting <no-reply@ashbyhq.com>`), appId);
    const { data } = await db.from("companies").select("other_names").eq("id", companyId).single();
    expect(data!.other_names).toEqual([`Onepay${tag}`]);
  });
});
