// M9 apply runner against a local Supabase, with a fake browser:
//   - an approved Greenhouse application is listed with its board, questions and resume
//   - a supervised run fills, records both screenshots, marks it submitted and grows the streak
//   - a field the user changed before submitting resets the streak
//   - a required question without an answer, or a CAPTCHA, hands it back as Apply yourself
//   - auto mode is refused until the streak is earned
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Db } from "@/server/db/types";
import { listReadyToApply } from "@/server/modules/apply/apply.repository";
import { applyOne, setPlatformMode, type FormDriver } from "@/server/modules/apply/apply.service";
import type { FillStep } from "@/server/modules/apply/fill-plan";
import type {} from "./setup";
import { testUser } from "./users";

const { url: URL, serviceRoleKey: SERVICE } = inject("supabase");
const db = createClient(URL, SERVICE, { auth: { persistSession: false } }) as unknown as Db;

const tag = randomUUID().slice(0, 8);
let companyId = "";
let userId = "";
let cleanupUser = async () => {};
const jobIds: string[] = [];
const pdfPaths: string[] = [];
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** An approved application with a name field, the resume and a select. */
async function addApproved(key: string, opts: { requiredUnanswered?: boolean } = {}): Promise<string> {
  const { data: job } = await db
    .from("jobs")
    .insert({ company_id: companyId, company_name: `ApplyCo ${tag}`, source: "greenhouse", external_id: `${tag}${key}`, url: `https://example.test/${tag}/${key}`, title: `Engineer ${key}`, dedup_key: `${tag}-apply-${key}` })
    .select("id")
    .single();
  jobIds.push(job!.id);
  const { data: app, error } = await db.from("applications").insert({ user_id: userId, job_id: job!.id, status: "approved", approved_at: new Date().toISOString() }).select("id").single();
  if (error) throw new Error(error.message);
  // Every row carries every key: a bulk insert sends null for missing ones.
  const base = { application_id: app!.id, bucket: "auto", required: false, options: null, answer: null, answer_value: null };
  const inserted = await db.from("application_questions").insert([
    { ...base, question: "First Name", field_name: "first_name", field_type: "text", answer: "Ada", required: true, sort_order: 0 },
    { ...base, question: "Resume/CV", field_name: "resume", field_type: "file", answer: "Tailored resume (PDF)", required: true, sort_order: 1 },
    { ...base, question: "Sponsorship?", field_name: "question_9", field_type: "select", options: [{ label: "No", value: "1" }], answer: "No", answer_value: "1", sort_order: 2 },
    ...(opts.requiredUnanswered ? [{ ...base, bucket: "needs_user", question: "Why us?", field_name: "question_10", field_type: "textarea", required: true, sort_order: 3 }] : []),
  ]);
  if (inserted.error) throw new Error(inserted.error.message);
  const pdfPath = `${userId}/${app!.id}.pdf`;
  pdfPaths.push(pdfPath);
  await db.storage.from("resumes").upload(pdfPath, new TextEncoder().encode("%PDF-1.4 test"), { contentType: "application/pdf", upsert: true });
  await db.from("resumes").insert({ user_id: userId, application_id: app!.id, kind: "tailored", label: key, content: {}, pdf_path: pdfPath, sha256: "abc123" });
  return app!.id;
}

/** A browser that fills everything and confirms on the second look, optionally with the user's edits or a CAPTCHA. */
function fakeDriver(opts: { edits?: Record<string, string>; challenge?: boolean } = {}) {
  const filled: Record<string, string> = {};
  let looks = 0;
  const driver: FormDriver = {
    open: async () => "ok",
    fill: async (step: FillStep) => {
      filled[step.fieldName] = step.kind === "text" ? step.value : step.kind === "select" ? step.value.join(", ") : "resume.pdf";
      return true;
    },
    values: async () => ({ ...filled, ...opts.edits }),
    challenge: async () => opts.challenge ?? false,
    confirmation: async () => (++looks > 1 ? "Thank you for applying." : null),
    submit: async () => {},
    screenshot: async () => PNG,
    focus: async () => {},
    closed: () => false,
  };
  return { driver, filled };
}

const deps = (driver: FormDriver) => ({
  db,
  userId,
  driver,
  fullName: "Ada Lovelace",
  saveResume: async () => "/tmp/resume.pdf",
  log: () => {},
  pollMs: 0,
  sleep: async () => {},
});

async function app(id: string) {
  const { data } = await db.from("applications").select("status, apply_step, apply_note").eq("id", id).single();
  return data!;
}

async function streak() {
  const { data } = await db.from("platforms").select("clean_streak, mode").eq("user_id", userId).eq("ats", "greenhouse").maybeSingle();
  return data;
}

beforeAll(async () => {
  ({ id: userId, cleanup: cleanupUser } = await testUser(db));
  await db.from("platforms").delete().eq("user_id", userId).eq("ats", "greenhouse");
  const { data: company } = await db.from("companies").insert({ name: `ApplyCo ${tag}`, ats: "greenhouse", board_token: `apply${tag}` }).select("id").single();
  companyId = company!.id;
});

afterAll(async () => {
  const { data: evidence } = await db.from("application_evidence_items").select("storage_path, applications!inner(job_id)").in("applications.job_id", jobIds);
  const paths = (evidence ?? []).map((e) => e.storage_path).filter((p): p is string => !!p);
  if (paths.length) await db.storage.from("evidence").remove(paths);
  await db.storage.from("resumes").remove(pdfPaths);
  await db.from("applications").delete().in("job_id", jobIds);
  await db.from("jobs").delete().in("id", jobIds);
  await db.from("companies").delete().eq("id", companyId);
  await db.from("platforms").delete().eq("user_id", userId).eq("ats", "greenhouse");
  await cleanupUser();
});

describe("apply runner", () => {
  it("lists an approved Greenhouse application with its board, questions and resume", async () => {
    const id = await addApproved("list");
    const ready = (await listReadyToApply(db, userId, ["greenhouse"])).find((a) => a.id === id);
    expect(ready?.job.board_token).toBe(`apply${tag}`);
    expect(ready?.questions.map((q) => q.field_name)).toEqual(["first_name", "resume", "question_9"]);
    expect(ready?.resume?.sha256).toBe("abc123");
    // Keep it out of the later runs' way.
    await db.from("applications").update({ apply_step: "filling" }).eq("id", id);
  });

  it("fills, records evidence, marks it submitted and grows the streak", async () => {
    const id = await addApproved("clean");
    const [job] = (await listReadyToApply(db, userId, ["greenhouse"])).filter((a) => a.id === id);
    const { driver, filled } = fakeDriver();
    expect(await applyOne(deps(driver), job)).toEqual({ result: "submitted", changed: [] });
    expect(filled).toEqual({ first_name: "Ada", resume: "resume.pdf", question_9: "No" });
    expect(await app(id)).toMatchObject({ status: "submitted", apply_step: null });
    const { data: evidence } = await db.from("application_evidence_items").select("kind, detail").eq("application_id", id).order("created_at");
    expect(evidence?.map((e) => e.kind)).toEqual(["screenshot", "confirmation_page"]);
    expect(evidence?.[0].detail).toMatchObject({ resume_sha256: "abc123" });
    expect(await streak()).toEqual({ clean_streak: 1, mode: "supervised" });
  });

  it("resets the streak when the user changed a field before submitting", async () => {
    const id = await addApproved("edited");
    const [job] = (await listReadyToApply(db, userId, ["greenhouse"])).filter((a) => a.id === id);
    const outcome = await applyOne(deps(fakeDriver({ edits: { first_name: "Augusta" } }).driver), job);
    expect(outcome).toEqual({ result: "submitted", changed: ["First Name"] });
    expect((await app(id)).apply_note).toContain("First Name");
    expect(await streak()).toEqual({ clean_streak: 0, mode: "supervised" });
  });

  it("hands back a form with a required question it can't answer", async () => {
    const id = await addApproved("blocked", { requiredUnanswered: true });
    const [job] = (await listReadyToApply(db, userId, ["greenhouse"])).filter((a) => a.id === id);
    const outcome = await applyOne(deps(fakeDriver().driver), job);
    expect(outcome).toMatchObject({ result: "handed_back" });
    expect(await app(id)).toMatchObject({ status: "manual", apply_step: null, apply_note: expect.stringContaining("Why us?") });
  });

  it("hands back when a CAPTCHA shows, without submitting", async () => {
    const id = await addApproved("captcha");
    const [job] = (await listReadyToApply(db, userId, ["greenhouse"])).filter((a) => a.id === id);
    const outcome = await applyOne(deps(fakeDriver({ challenge: true }).driver), job);
    expect(outcome).toMatchObject({ result: "handed_back", reason: expect.stringContaining("verification") });
    expect((await app(id)).status).toBe("manual");
  });

  it("refuses auto mode until the streak is earned", async () => {
    await expect(setPlatformMode(db, userId, "greenhouse", "auto")).rejects.toThrow(/auto needs 3 clean runs/);
  });
});
