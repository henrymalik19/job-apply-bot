// A company's limit on applications, against a local Supabase:
//   - with a known rule and enough sent in its window, you're paused there, with the date kept (no refusal needed)
//   - once it's over, applications skipped for the limit are removed so their jobs are prepared again
//   - Clear takes the pause and the rule away
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Db } from "@/server/db/types";
import { transition } from "@/server/modules/applications/applications.repository";
import { getSkipReason } from "@/server/modules/applications/applications.repository";
import { clearLimit, companiesAtLimit, getCompanyLimit, LIMIT_CAUSE, reviveAfterLimit } from "@/server/modules/companies/apply-limits";
import type {} from "./setup";
import { testUser } from "./users";

const { url: URL, serviceRoleKey: SERVICE } = inject("supabase");
const db = createClient(URL, SERVICE, { auth: { persistSession: false } }) as unknown as Db;
const tag = randomUUID().slice(0, 8);
const DAY = 86_400_000;
let userId = "";
let cleanupUser = async () => {};
let companyId = "";
const jobIds: string[] = [];

async function addApp(key: string, status: string, submittedDaysAgo?: number) {
  const { data: job } = await db
    .from("jobs")
    .insert({ company_id: companyId, company_name: `Limitco ${tag}`, source: "ashby", external_id: `${tag}${key}`, url: `https://example.test/${tag}/${key}`, title: `Engineer ${key}`, dedup_key: `${tag}-${key}` })
    .select("id")
    .single();
  jobIds.push(job!.id);
  const submitted_at = submittedDaysAgo == null ? null : new Date(Date.now() - submittedDaysAgo * DAY).toISOString();
  const { data: app, error } = await db.from("applications").insert({ user_id: userId, job_id: job!.id, status, submitted_at }).select("id").single();
  if (error) throw new Error(error.message);
  return app!.id as string;
}

beforeAll(async () => {
  ({ id: userId, cleanup: cleanupUser } = await testUser(db));
  const { data: company } = await db.from("companies").insert({ name: `Limitco ${tag}`, ats: "ashby", board_token: `limitco${tag}`, apply_limit: 2, apply_limit_days: 60 }).select("id").single();
  companyId = company!.id;
  await db.from("user_companies").insert({ user_id: userId, company_id: companyId });
});

afterAll(async () => {
  await db.from("applications").delete().in("job_id", jobIds);
  await db.from("jobs").delete().in("id", jobIds);
  await db.from("companies").delete().eq("id", companyId);
  await cleanupUser();
});

const follow = async () => (await db.from("user_companies").select("paused_until, pause_reason").eq("user_id", userId).eq("company_id", companyId).single()).data!;

describe("company application limits", () => {
  it("pauses you at a company's known limit, keeps the date, brings skipped ones back after, and clears", async () => {
    await addApp("old", "submitted", 50);
    await addApp("new", "confirmed", 10);
    await addApp("ancient", "submitted", 90); // outside the window
    const waiting = await addApp("waiting", "queued");
    await transition(db, waiting, "skipped", LIMIT_CAUSE, { reason: "limit" });
    const ready = await addApp("ready", "queued");

    expect((await companiesAtLimit(db, userId, new Date())).has(companyId)).toBe(true);
    // One still waiting there is skipped too, to come back with the rest.
    const { data: readyNow } = await db.from("applications").select("status").eq("id", ready).single();
    expect(readyNow!.status).toBe("skipped");
    const paused = await follow();
    // The older of the two in the window leaves it in 10 days.
    const days = (new Date(paused.paused_until!).getTime() - Date.now()) / DAY;
    expect(days).toBeGreaterThan(9.9);
    expect(days).toBeLessThan(10.1);
    expect(paused.pause_reason).toMatch(/takes 2 applications per 60 days, and you've sent 2/);
    // What the job and application pages show.
    expect(await getCompanyLimit(db, userId, companyId, new Date())).toMatchObject({ limit: 2, days: 60, pausedUntil: paused.paused_until });
    expect(await getSkipReason(db, ready)).toEqual({ cause: LIMIT_CAUSE, reason: paused.pause_reason });
    // Still paused: the skipped one stays.
    expect(await reviveAfterLimit(db, userId, new Set([companyId]))).toBe(0);

    // 11 days on, the slot is free: the skipped one is removed so its job is prepared again.
    const later = new Date(Date.now() + 11 * DAY);
    const atLimit = await companiesAtLimit(db, userId, later);
    expect(atLimit.has(companyId)).toBe(false);
    expect(await reviveAfterLimit(db, userId, atLimit)).toBe(2);
    expect((await db.from("applications").select("id").eq("id", waiting)).data).toEqual([]);

    await clearLimit(db, userId, companyId);
    expect(await follow()).toEqual({ paused_until: null, pause_reason: null });
    const { data: company } = await db.from("companies").select("apply_limit").eq("id", companyId).single();
    expect(company!.apply_limit).toBeNull();
    expect(await getCompanyLimit(db, userId, companyId, new Date())).toBeNull();
  });
});
