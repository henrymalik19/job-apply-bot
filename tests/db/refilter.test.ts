// Jobs already scored, re-checked against your current criteria (saving the Search page), against a local Supabase:
//   - a staffing agency's job you haven't applied to is ruled out, with the reason
//   - one you have an application for, and an employer's, are left as they were
//   - with skipping agencies turned off, nothing is ruled out
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Db } from "@/server/db/types";
import { refilterScoredMatches } from "@/server/modules/matching/matching.service";
import type {} from "./setup";
import { testUser } from "./users";

const { url: URL, serviceRoleKey: SERVICE } = inject("supabase");
const db = createClient(URL, SERVICE, { auth: { persistSession: false } }) as unknown as Db;

const tag = randomUUID().slice(0, 8);
let userId = "";
let cleanupUser = async () => {};
const jobIds: Record<string, string> = {};

async function addScored(key: string, company: string) {
  const { data: job, error } = await db.from("jobs")
    .insert({ company_name: company, source: "linkedin", external_id: `${tag}${key}`, url: `https://example.test/${tag}/${key}`, title: "Senior Software Engineer", dedup_key: `${tag}-refilter-${key}` })
    .select("id").single();
  if (error) throw new Error(error.message);
  jobIds[key] = job!.id;
  const inserted = await db.from("matches").insert({ user_id: userId, job_id: job!.id, status: "scored", hard_filter_passed: true, score: 82 });
  if (inserted.error) throw new Error(inserted.error.message);
}

const statusOf = async (key: string) =>
  (await db.from("matches").select("status, hard_filter_reason, score").eq("user_id", userId).eq("job_id", jobIds[key]).single()).data;

beforeAll(async () => {
  ({ id: userId, cleanup: cleanupUser } = await testUser(db));
  await addScored("agency", "Jobgether");
  await addScored("applied", "Robert Half");
  await addScored("employer", "Coinbase");
  await db.from("applications").insert({ user_id: userId, job_id: jobIds.applied, status: "queued" });
});

afterAll(async () => {
  await db.from("applications").delete().eq("user_id", userId);
  await db.from("matches").delete().eq("user_id", userId);
  await db.from("jobs").delete().in("id", Object.values(jobIds));
  await cleanupUser();
});

describe("refilterScoredMatches", () => {
  it("does nothing while skipping agencies is turned off", async () => {
    await db.from("match_criteria").upsert({ user_id: userId, skip_staffing_agencies: false }, { onConflict: "user_id" });
    expect(await refilterScoredMatches(db, userId)).toBe(0);
  });

  it("rules out a staffing agency's job you haven't applied to, and leaves the rest", async () => {
    await db.from("match_criteria").upsert({ user_id: userId, skip_staffing_agencies: true }, { onConflict: "user_id" });
    expect(await refilterScoredMatches(db, userId)).toBe(1);
    expect(await statusOf("agency")).toEqual({ status: "filtered", hard_filter_reason: "staffing agency: Jobgether", score: 82 });
    expect((await statusOf("applied"))?.status).toBe("scored");
    expect((await statusOf("employer"))?.status).toBe("scored");
    // Run again: nothing more to do.
    expect(await refilterScoredMatches(db, userId)).toBe(0);
  });
});
