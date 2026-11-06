// Jobs a LinkedIn search found, saved for a user against a local Supabase:
//   - under a company found by name, or one added without a board, which the user then follows
//   - a second save of the same jobs adds nothing
//   - prepare makes a LinkedIn application ready to review with no questions (they're answered in the form)
//   - questions the runner found in the form go on the application: Needs you while one has no answer,
//     Ready to review with LinkedIn's other answer and Claude's to double-check
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Db } from "@/server/db/types";
import { saveLinkedInJobs, type LinkedInJob } from "@/server/modules/discovery/linkedin-jobs";
import { prepareJob } from "@/server/modules/prepare/prepare.service";
import { saveFormQuestions } from "@/server/modules/apply/form-questions";
import type {} from "./setup";
import { testUser } from "./users";

const { url: URL, serviceRoleKey: SERVICE } = inject("supabase");
const db = createClient(URL, SERVICE, { auth: { persistSession: false } }) as unknown as Db;

const tag = randomUUID().slice(0, 8);
let userId = "";
let cleanupUser = async () => {};
let knownId = "";
const ids = [`9${tag.replace(/\D/g, "1").slice(0, 6)}01`, `9${tag.replace(/\D/g, "1").slice(0, 6)}02`];

const job = (id: string, company: string): LinkedInJob => ({
  id, title: "Senior Software Engineer", company, location: "United States", remoteType: "remote",
  salaryMin: 150000, salaryMax: 200000, description: "Build things.", postedAt: null,
});

beforeAll(async () => {
  ({ id: userId, cleanup: cleanupUser } = await testUser(db));
  const { data } = await db.from("companies").insert({ name: `Knownco ${tag}`, ats: "greenhouse", board_token: `known${tag}` }).select("id").single();
  knownId = data!.id;
});

afterAll(async () => {
  await db.from("jobs").delete().eq("source", "linkedin").in("external_id", ids);
  await db.from("companies").delete().in("name", [`Knownco ${tag}`, `Newco ${tag}`]);
  await cleanupUser();
});

describe("LinkedIn jobs", () => {
  it("saves each job under its company, which you then follow, once", async () => {
    const jobs = [job(ids[0], `knownco ${tag}`), job(ids[1], `Newco ${tag}`)];
    expect(await saveLinkedInJobs(db, userId, jobs)).toEqual({ inserted: 2, duplicates: 0 });
    expect(await saveLinkedInJobs(db, userId, jobs)).toEqual({ inserted: 0, duplicates: 2 });

    const { data: rows } = await db.from("jobs").select("external_id, company_id, company_name, url, remote_type, salary_min").eq("source", "linkedin").in("external_id", ids).order("external_id");
    expect(rows![0]).toMatchObject({ company_id: knownId, company_name: `Knownco ${tag}`, url: `https://www.linkedin.com/jobs/view/${ids[0]}/`, remote_type: "remote", salary_min: 150000 });
    const { data: added } = await db.from("companies").select("id, ats, board_token").eq("name", `Newco ${tag}`).single();
    expect(added).toMatchObject({ ats: "other", board_token: null });
    expect(rows![1].company_id).toBe(added!.id);

    const { data: follows } = await db.from("user_companies").select("company_id").eq("user_id", userId).in("company_id", [knownId, added!.id]);
    expect(follows).toHaveLength(2);
  });

  it("saves the form's questions on an approved application and sends it back to you", async () => {
    // One application per job: one on each of the two saved jobs.
    const add = async (externalId: string) => {
      const { data: job } = await db.from("jobs").select("id").eq("source", "linkedin").eq("external_id", externalId).single();
      const { data } = await db.from("applications").insert({ user_id: userId, job_id: job!.id, status: "approved", approved_at: new Date().toISOString() }).select("id").single();
      return data!.id as string;
    };
    const conflict = { key: "q:years of python", label: "Years of Python", kind: "text" as const, options: [], required: true, conflict: { form: "3", yours: "8" } };
    const id = await add(ids[1]);
    const status = await saveFormQuestions(db, userId, id, [
      { key: "q:do you hold a clearance?", label: "Do you hold a clearance?", kind: "select", options: ["Yes", "No"], required: true },
      conflict,
      { key: "q:years of go", label: "Years of Go", kind: "text", options: [], required: true, answer: ["5"] },
    ]);
    expect(status).toBe("needs_input");
    const { data: rows } = await db.from("application_questions").select("field_name, field_type, options, bucket, answer, answer_source, needs_check").eq("application_id", id).order("sort_order");
    expect(rows).toEqual([
      { field_name: "q:do you hold a clearance?", field_type: "select", options: [{ label: "Yes", value: "Yes" }, { label: "No", value: "No" }], bucket: "needs_user", answer: null, answer_source: null, needs_check: false },
      { field_name: "q:years of python", field_type: "select", options: [{ label: "8", value: "8" }, { label: "3", value: "3" }], bucket: "auto", answer: "8", answer_source: "linkedin", needs_check: true },
      { field_name: "q:years of go", field_type: "text", options: [], bucket: "auto", answer: "5", answer_source: "profile", needs_check: true },
    ]);

    // Only an answer to double-check: Ready to review.
    const other = await add(ids[0]);
    expect(await saveFormQuestions(db, userId, other, [conflict])).toBe("queued");
    // Not approved any more: refused.
    await expect(saveFormQuestions(db, userId, other, [conflict])).rejects.toThrow(/approved/);
    await db.from("applications").delete().in("id", [id, other]);
  });

  it("is ready to review once prepared, with its questions left to the form", async () => {
    const candidate = { matchId: "m", score: 90, job: { id: "j", title: "Senior Software Engineer", company_name: "Newco", company_id: null, source: "linkedin", external_id: ids[1], description_md: "Build things.", location: "United States", closed_at: null, board_token: "" } };
    const out = await prepareJob({ db, userId } as never, candidate as never, {} as never);
    expect(out).toMatchObject({ status: "queued", questions: [], posting: { text: "Build things." } });
  });
});
