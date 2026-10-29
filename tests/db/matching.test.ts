// M4 acceptance against a local Supabase, with a fake LLM:
//   - hard filters record a reason without an LLM call
//   - invalid LLM output is retried once, then the job is marked failed
//   - one match per job: re-running and changing criteria don't rescore
//   - an active scoring lesson is in the prompt, an inactive one isn't
//   - usage is recorded per call, and the monthly cap defers scoring
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Db } from "@/server/db/types";
import type { StructuredCall } from "@/server/integrations/anthropic/claude";
import { getMatchCriteria, saveMatchCriteria } from "@/server/modules/criteria/criteria.service";
import { parseJobFilters } from "@/server/modules/jobs/jobs.service";
import { browseJobs, runMatch } from "@/server/modules/matching/matching.service";
import type {} from "./setup";

const { url: URL, serviceRoleKey: SERVICE } = inject("supabase");
const db = createClient(URL, SERVICE, { auth: { persistSession: false } }) as unknown as Db;

const tag = randomUUID().slice(0, 8);
let companyId = "";
const jobIds: Record<string, string> = {};
const lessonIds: string[] = [];
let ownerId = "";
let createdOwner = false;
let previousCriteria: Record<string, unknown> | null = null;
let previousCap: unknown;

// Fake model: answers by job title. "Garbage" never validates; "Flaky" fails once.
const prompts: string[] = [];
const attempts: Record<string, number> = {};
const fakeCall: StructuredCall = async ({ system, user }) => {
  prompts.push(system);
  const title = /Title: (.*)/.exec(user)?.[1] ?? "";
  attempts[title] = (attempts[title] ?? 0) + 1;
  const usage = { input_tokens: 1000, output_tokens: 100 };
  const model = "claude-haiku-5-5";
  if (title.startsWith("Garbage")) return { output: null, model, usage, error: "output did not match the schema" };
  if (title.startsWith("Flaky") && attempts[title] === 1) {
    return { output: { score: 250, fits: [], gaps: [], summary: "" } as never, model, usage };
  }
  return { output: { score: 82, fits: ["TypeScript"], gaps: ["No Go"], summary: "Good fit." } as never, model, usage };
};

const criteriaInput = (excluded: string) => ({
  roles: "Staff Software Engineer",
  seniority: [],
  salaryMin: "",
  salaryMax: "",
  relocate: "",
  dealbreakers: "",
  excludedCompanies: excluded,
  threshold: "75",
  notes: "",
});

const match = () =>
  runMatch({ db, call: fakeCall, onlyJobIds: Object.values(jobIds), concurrency: 2 });

async function matchRows() {
  const { data } = await db.from("matches").select("*").in("job_id", Object.values(jobIds));
  return data ?? [];
}

beforeAll(async () => {
  // Criteria belong to the owner; use the local owner (or a temporary one) and restore its criteria after.
  const { data: owner } = await db.from("users").select("id").eq("role", "owner").maybeSingle();
  ownerId = owner?.id ?? randomUUID();
  if (!owner) {
    await db.from("users").insert({ id: ownerId, role: "owner" });
    createdOwner = true;
  }
  const { data: criteriaRow } = await db.from("match_criteria").select("*").eq("user_id", ownerId).maybeSingle();
  previousCriteria = criteriaRow;
  const { data: cap } = await db.from("settings").select("value").eq("key", "llm_monthly_cap_usd").maybeSingle();
  previousCap = cap?.value ?? 5;
  await db.from("settings").upsert({ key: "llm_monthly_cap_usd", value: 1000 });

  const { data: company, error } = await db.from("companies").insert({ name: `MatchCo ${tag}`, ats: "greenhouse", board_token: `match${tag}` }).select("id").single();
  if (error) throw error;
  companyId = company.id;
  for (const [key, title, companyName] of [
    ["good", "Staff Engineer", `MatchCo ${tag}`],
    ["flaky", "Flaky Staff Engineer", `MatchCo ${tag}`],
    ["garbage", "Garbage Engineer", `MatchCo ${tag}`],
    ["excluded", "Staff Engineer at Excluded", `Excluded ${tag}`],
  ]) {
    const { data: job, error: jobErr } = await db
      .from("jobs")
      .insert({ company_id: companyId, company_name: companyName, source: "greenhouse", external_id: `${tag}-${key}`, url: `https://example.test/${tag}/${key}`, title, dedup_key: `${tag}-${key}`, description_md: "Build APIs." })
      .select("id")
      .single();
    if (jobErr) throw jobErr;
    jobIds[key] = job.id;
  }
  await saveMatchCriteria(db, ownerId, criteriaInput(`Excluded ${tag}`));

  for (const [rule, active] of [[`Prefer platform teams ${tag}`, true], [`Ignore fintech ${tag}`, false]] as const) {
    const { data, error: lessonErr } = await db.from("lessons").insert({ rule, scope: "scoring", active }).select("id").single();
    if (lessonErr) throw lessonErr;
    lessonIds.push(data.id);
  }
});

afterAll(async () => {
  const ids = Object.values(jobIds);
  await db.from("matches").delete().in("job_id", ids);
  await db.from("llm_calls").delete().in("job_id", ids);
  await db.from("jobs").delete().in("id", ids);
  await db.from("companies").delete().eq("id", companyId);
  await db.from("lessons").delete().in("id", lessonIds);
  if (previousCriteria) await db.from("match_criteria").upsert(previousCriteria as never);
  else await db.from("match_criteria").delete().eq("user_id", ownerId);
  if (createdOwner) await db.from("users").delete().eq("id", ownerId);
  await db.from("settings").upsert({ key: "llm_monthly_cap_usd", value: previousCap as number });
  await db.from("runs").delete().eq("worker", "match").gt("started_at", new Date(Date.now() - 3600_000).toISOString());
});

beforeEach(() => {
  prompts.length = 0;
});

describe("matching", () => {
  it("filters, scores, retries once and marks persistent failures", async () => {
    const { counts } = await match();
    expect(counts).toMatchObject({ candidates: 4, filtered: 1, scored: 2, failed: 1, deferred: 0 });

    const rows = new Map((await matchRows()).map((r) => [r.job_id, r]));
    expect(rows.get(jobIds.excluded)).toMatchObject({ status: "filtered", hard_filter_passed: false, hard_filter_reason: `excluded company: Excluded ${tag}`, score: null });
    expect(rows.get(jobIds.good)).toMatchObject({ status: "scored", score: 82, reasons: { fits: ["TypeScript"], gaps: ["No Go"], summary: "Good fit." } });
    expect(rows.get(jobIds.flaky)).toMatchObject({ status: "scored", score: 82 });
    expect(rows.get(jobIds.garbage)).toMatchObject({ status: "failed", score: null });
    expect(rows.get(jobIds.garbage)!.error).toMatch(/schema/);
    expect(attempts["Garbage Engineer"]).toBe(2);
    expect(attempts["Flaky Staff Engineer"]).toBe(2);
    expect(attempts["Staff Engineer at Excluded"]).toBeUndefined();
  });

  it("records usage and cost for every LLM call", async () => {
    const { data } = await db.from("llm_calls").select("purpose, cost_usd").in("job_id", Object.values(jobIds));
    // good 1 + flaky 2 + garbage 2 = 5 calls at $0.00015 each (1,000 in, 100 out on Haiku)
    expect(data).toHaveLength(5);
    expect(data!.every((u) => u.purpose === "score" && Number(u.cost_usd) === 0.00015)).toBe(true);
  });

  it("includes active scoring lessons in the prompt and leaves out inactive ones", async () => {
    await db.from("matches").delete().eq("job_id", jobIds.good);
    await match();
    expect(prompts.length).toBeGreaterThan(0);
    expect(prompts[0]).toContain(`Prefer platform teams ${tag}`);
    expect(prompts[0]).not.toContain(`Ignore fintech ${tag}`);
  });

  it("keeps one match per job: re-runs and criteria changes don't rescore", async () => {
    expect((await matchRows()).length).toBe(4);
    const again = await match();
    expect(again.counts.candidates).toBe(0);

    const unchanged = await saveMatchCriteria(db, ownerId, criteriaInput(`Excluded ${tag}`));
    expect(unchanged.changed).toBe(false);
    const changed = await saveMatchCriteria(db, ownerId, criteriaInput(`Excluded ${tag}, Someone Else ${tag}`));
    expect(changed.changed).toBe(true);
    expect((await getMatchCriteria(db)).excluded_companies).toContain(`Someone Else ${tag}`);
    expect((await match()).counts.candidates).toBe(0);
    expect((await matchRows()).length).toBe(4);
  });

  it("lists relevant, matched and ruled-out jobs, sorted in the database", async () => {
    const days = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
    await db.from("jobs").update({ posted_at: days(3) }).eq("id", jobIds.good);
    await db.from("jobs").update({ posted_at: days(1) }).eq("id", jobIds.flaky);
    await db.from("jobs").update({ posted_at: days(2) }).eq("id", jobIds.garbage);
    const browse = async (match: string, sort = "found") =>
      (await browseJobs(db, parseJobFilters({ q: tag, posted: "any", match, sort }), 1, new Date())).page.items;

    const relevant = await browse("relevant", "posted");
    expect(relevant.map((j) => j.id)).toEqual([jobIds.flaky, jobIds.garbage, jobIds.good]);
    expect((await browse("matched", "score")).map((j) => j.id).sort()).toEqual([jobIds.good, jobIds.flaky].sort());
    const ruledOut = await browse("ruled_out");
    expect(ruledOut).toHaveLength(1);
    expect(ruledOut[0]).toMatchObject({ id: jobIds.excluded, matchStatus: "filtered", filterReason: `excluded company: Excluded ${tag}` });
    expect(await browse("all")).toHaveLength(4);
  });

  it("defers scoring once the monthly spend cap is reached", async () => {
    await db.from("settings").upsert({ key: "llm_monthly_cap_usd", value: 0.000001 });
    await db.from("matches").delete().in("job_id", Object.values(jobIds));
    const { counts } = await match();
    expect(counts).toMatchObject({ candidates: 4, filtered: 1, scored: 0, failed: 0, deferred: 3 });
    await db.from("settings").upsert({ key: "llm_monthly_cap_usd", value: 1000 });
  });
});
