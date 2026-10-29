// M4 acceptance against a local Supabase, with a fake LLM:
//   - hard filters record a reason without an LLM call
//   - invalid LLM output is retried once, then the job is marked failed
//   - re-running doesn't duplicate rows; changing criteria creates a new
//     version and rescoring adds rows for it
//   - an active scoring lesson is in the prompt, an inactive one isn't
//   - usage is recorded per call, and the monthly cap defers scoring
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Db } from "@/server/db/types";
import type { StructuredCall } from "@/server/integrations/anthropic/claude";
import { getMatchCriteria, saveMatchCriteria } from "@/server/modules/criteria/criteria.service";
import { runMatch } from "@/server/modules/matching/matching.service";
import type {} from "./setup";

const { url: URL, serviceRoleKey: SERVICE } = inject("supabase");
const db = createClient(URL, SERVICE, { auth: { persistSession: false } }) as unknown as Db;

const tag = randomUUID().slice(0, 8);
let companyId = "";
const jobIds: Record<string, string> = {};
const lessonIds: string[] = [];
let previousVersionTime = "";
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
  minSalary: "",
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
  const { data: latest } = await db.from("criteria_versions").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle();
  previousVersionTime = latest?.created_at ?? "1970-01-01T00:00:00Z";
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
  await saveMatchCriteria(db, criteriaInput(`Excluded ${tag}`));

  for (const [rule, active] of [[`Prefer platform teams ${tag}`, true], [`Ignore fintech ${tag}`, false]] as const) {
    const { data, error: lessonErr } = await db.from("lessons").insert({ rule, scope: "scoring", active }).select("id").single();
    if (lessonErr) throw lessonErr;
    lessonIds.push(data.id);
  }
});

afterAll(async () => {
  const ids = Object.values(jobIds);
  await db.from("matches").delete().in("job_id", ids);
  await db.from("llm_usage").delete().in("job_id", ids);
  await db.from("jobs").delete().in("id", ids);
  await db.from("companies").delete().eq("id", companyId);
  await db.from("lessons").delete().in("id", lessonIds);
  await db.from("criteria_versions").delete().gt("created_at", previousVersionTime);
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
    const { data } = await db.from("llm_usage").select("purpose, cost_usd").in("job_id", Object.values(jobIds));
    // good 1 + flaky 2 + garbage 2 = 5 calls at $0.00015 each (1,000 in, 100 out on Haiku)
    expect(data).toHaveLength(5);
    expect(data!.every((u) => u.purpose === "score" && Number(u.cost_usd) === 0.00015)).toBe(true);
  });

  it("includes active scoring lessons in the prompt and leaves out inactive ones", async () => {
    await saveMatchCriteria(db, criteriaInput(`Excluded ${tag}, Someone Else ${tag}`));
    await match();
    expect(prompts.length).toBeGreaterThan(0);
    expect(prompts[0]).toContain(`Prefer platform teams ${tag}`);
    expect(prompts[0]).not.toContain(`Ignore fintech ${tag}`);
  });

  it("doesn't duplicate rows on re-run, and adds rows when criteria change", async () => {
    const before = (await matchRows()).length; // two versions × 4 jobs
    expect(before).toBe(8);
    const again = await match();
    expect(again.counts.candidates).toBe(0);
    expect((await matchRows()).length).toBe(8);

    const unchanged = await saveMatchCriteria(db, criteriaInput(`Excluded ${tag}, Someone Else ${tag}`));
    expect(unchanged.created).toBe(false);
    const changed = await saveMatchCriteria(db, criteriaInput(`Excluded ${tag}`));
    expect(changed.created).toBe(true);
    expect((await getMatchCriteria(db)).versionId).toBe(changed.versionId);
    await match();
    expect((await matchRows()).length).toBe(12);
  });

  it("defers scoring once the monthly spend cap is reached", async () => {
    await db.from("settings").upsert({ key: "llm_monthly_cap_usd", value: 0.000001 });
    await saveMatchCriteria(db, criteriaInput(`Excluded ${tag}, Cap Test ${tag}`));
    const { counts } = await match();
    expect(counts).toMatchObject({ candidates: 4, filtered: 1, scored: 0, failed: 0, deferred: 3 });
    await db.from("settings").upsert({ key: "llm_monthly_cap_usd", value: 1000 });
  });
});
