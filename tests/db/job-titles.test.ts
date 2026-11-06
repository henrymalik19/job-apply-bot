// Job titles for target-role suggestions, against a local Supabase:
//   - a title is cleaned up: noise out, abbreviations spelled out, one spelling; different roles stay apart
//   - each new job counts toward its cleaned title
//   - suggestions match every typed word, those starting with it first, leaving out one-offs and non-roles
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Db } from "@/server/db/types";
import { suggestJobTitles } from "@/server/modules/criteria/job-titles";
import type {} from "./setup";

const { url: URL, serviceRoleKey: SERVICE } = inject("supabase");
const db = createClient(URL, SERVICE, { auth: { persistSession: false } }) as unknown as Db;

// A made-up word (letters only, so cleaning keeps it) that keeps this test's titles apart from others.
const word = `Zq${randomUUID().replace(/[^a-f]/g, "").slice(0, 6)}`;
const jobIds: string[] = [];

const clean = async (raw: string) => (await db.rpc("clean_job_title", { raw })).data;

async function addJobs(title: string, n: number) {
  const rows = Array.from({ length: n }, (_, i) => ({
    company_name: "TitleCo", source: "greenhouse", external_id: `${word}-${title}-${i}`, url: `https://example.test/${word}/${i}`,
    title, dedup_key: `${word}-${title}-${i}`,
  }));
  const { data, error } = await db.from("jobs").insert(rows).select("id");
  if (error) throw new Error(error.message);
  jobIds.push(...data!.map((r) => r.id));
}

afterAll(async () => {
  if (jobIds.length) await db.from("jobs").delete().in("id", jobIds);
  await db.from("job_titles").delete().ilike("key", `%${word.toLowerCase()}%`);
});

describe("clean_job_title", () => {
  it.each([
    ["Sr. Software Engineer II (Remote)", "Senior Software Engineer"],
    ["SENIOR SOFTWARE ENGINEER", "Senior Software Engineer"],
    ["Senior Software Engineer - Payments", "Senior Software Engineer"],
    ["Software Engineer, Senior", "Senior Software Engineer"],
    ["Engineer, Senior Software", "Senior Software Engineer"],
    ["Senior Software Engineer (m/f/d)", "Senior Software Engineer"],
    ["Software Engineer #4521", "Software Engineer"],
    ["REQ-123 Data Scientist", "Data Scientist"],
    ["SWE II", "Software Engineer"],
    ["SDE2", "Software Development Engineer"],
    ["Software Engineer I", "Software Engineer"],
    ["Software Engineer 2", "Software Engineer"],
    ["Sr Backend Eng", "Senior Backend Engineer"],
    ["Full-Stack Developer | Remote US", "Full Stack Developer"],
    ["Fullstack Engineer", "Full Stack Engineer"],
    ["Front End Engineer", "Frontend Engineer"],
    ["ML Engineer III", "Machine Learning Engineer"],
    ["Software Engineer, AI/ML", "AI/ML Engineer"],
    ["Staff Engineer, Backend (L6)", "Staff Backend Engineer"],
    // A specialty says what kind of software; a data or security engineer is a role of its own.
    ["Senior Software Engineer, Backend", "Senior Backend Engineer"],
    ["Senior Backend Software Engineer", "Senior Backend Engineer"],
    ["Staff Software Engineer, Infrastructure", "Staff Infrastructure Engineer"],
    ["Software Engineer, Data", "Data Software Engineer"],
    ["Engineering Manager, Platform", "Engineering Manager"],
    ["Remote - Senior Product Designer", "Senior Product Designer"],
    ["DevOps Engineer - Contract-to-hire 12 months", "DevOps Engineer"],
    ["Senior Site Reliability Engineer (SRE)", "Senior Site Reliability Engineer"],
    ["iOS Engineer", "iOS Engineer"],
    [".NET Developer", ".NET Developer"],
    ["C++ Developer", "C++ Developer"],
    ["🚀 Rockstar Developer! Hiring now", "Rockstar Developer"],
    ["Head of Engineering", "Head of Engineering"],
  ])("%s -> %s", async (raw, cleaned) => {
    expect(await clean(raw)).toBe(cleaned);
  });

  it("keeps different roles apart", async () => {
    const titles = ["Senior Software Engineer", "Staff Software Engineer", "Software Developer", "Software Engineer", "Engineering Manager", "Data Engineer", "Data Scientist"];
    const cleaned = await Promise.all(titles.map(clean));
    expect(new Set(cleaned).size).toBe(titles.length);
  });

  it("knows a title naming no role", async () => {
    expect((await db.rpc("job_title_has_role", { t: "Join Our Team" })).data).toBe(false);
    expect((await db.rpc("job_title_has_role", { t: "Senior Software Engineer" })).data).toBe(true);
  });
});

describe("job titles", () => {
  beforeAll(async () => {
    await addJobs(`Senior ${word} Engineer II (Remote)`, 2);
    await addJobs(`Sr. ${word} Engineer`, 3);
    await addJobs(`Staff ${word} Engineer`, 4);
    await addJobs(`${word} Engineering Manager`, 3);
    // A one-off, and one naming no role: never suggested.
    await addJobs(`${word} Ninja Wizard`, 5);
    await addJobs(`Principal ${word} Engineer`, 1);
  });

  it("counts each new job toward its cleaned title", async () => {
    const { data } = await db.from("job_titles").select("title, postings, has_role").ilike("key", `%${word.toLowerCase()}%`).order("postings", { ascending: false });
    expect(data).toEqual(expect.arrayContaining([
      { title: `Senior ${word} Engineer`, postings: 5, has_role: true },
      { title: `Staff ${word} Engineer`, postings: 4, has_role: true },
      { title: `${word} Ninja Wizard`, postings: 5, has_role: false },
    ]));
  });

  it("suggests titles with every typed word, those starting with it first, leaving out one-offs and non-roles", async () => {
    expect((await suggestJobTitles(db, `${word} engineer`)).map((s) => s.title)).toEqual([
      `${word} Engineering Manager`, `Senior ${word} Engineer`, `Staff ${word} Engineer`,
    ]);
    expect(await suggestJobTitles(db, `senior ${word}`)).toEqual([{ title: `Senior ${word} Engineer`, postings: 5 }]);
    expect(await suggestJobTitles(db, " ")).toEqual([]);
    // Not posted in the last 90 days: left out.
    expect(await suggestJobTitles(db, `senior ${word}`, 8, new Date(Date.now() + 100 * 86_400_000))).toEqual([]);
  });
});
