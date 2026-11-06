// M9 apply runner against a local Supabase, with a fake browser:
//   - an approved Greenhouse application is listed with its board, questions and resume
//   - a supervised run fills, records both screenshots, marks it submitted and grows the streak
//   - a field the user changed before submitting resets the streak
//   - an optional field it couldn't fill is noted and kept with the evidence
//   - nobody submitting in time hands it back and closes the tab
//   - a required question without an answer, or a CAPTCHA, hands it back as Apply yourself
//   - a handed-back application can go back to the runner
//   - moving by hand (the board) follows the allowed transitions
//   - auto mode is refused until the streak is earned
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Db } from "@/server/db/types";
import { IllegalTransitionError, listUserMoves, moveApplication } from "@/server/modules/applications/applications.service";
import { listReadyToApply, setApplyStep } from "@/server/modules/apply/apply.repository";
import { applyOne, handBackUnfinished, retryApply, setPlatformMode, STOPPED_NOTE, type FormDriver, type OpenField, type PageQuestion, type QuestionToAsk } from "@/server/modules/apply/apply.service";
import type { FieldAnswer } from "@/server/modules/apply/field-mapping";
import type { FillStep } from "@/server/modules/apply/fill-plan";
import { APPLY_RUNS_BUCKET, listApplyRuns, listRunFilters, saveApplyRun } from "@/server/modules/apply/apply-runs";
import { companiesAtLimit } from "@/server/modules/companies/apply-limits";
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
async function addApproved(key: string, opts: { requiredUnanswered?: boolean; yourStep?: boolean } = {}): Promise<string> {
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
    ...(opts.yourStep ? [{ ...base, bucket: "cannot_automate", question: "Coding challenge", field_name: "question_11", field_type: "text", required: true, sort_order: 4 }] : []),
    ...(opts.requiredUnanswered ? [{ ...base, bucket: "needs_user", question: "Why us?", field_name: "question_10", field_type: "textarea", required: true, sort_order: 3 }] : []),
  ]);
  if (inserted.error) throw new Error(inserted.error.message);
  const pdfPath = `${userId}/${app!.id}.pdf`;
  pdfPaths.push(pdfPath);
  await db.storage.from("resumes").upload(pdfPath, new TextEncoder().encode("%PDF-1.4 test"), { contentType: "application/pdf", upsert: true });
  await db.from("resumes").insert({ user_id: userId, application_id: app!.id, kind: "tailored", label: key, content: {}, pdf_path: pdfPath, sha256: "abc123" });
  return app!.id;
}

/**
 * A browser that fills everything and confirms on the second look, optionally with the user's
 * edits, a CAPTCHA, fields it can't fill, or nobody ever submitting.
 */
function fakeDriver(opts: { edits?: Record<string, string>; challenge?: boolean; unfillable?: string[]; neverSubmitted?: boolean; open?: OpenField[]; rejects?: Record<string, string>; refused?: string; refusals?: number } = {}) {
  const filled: Record<string, string> = {};
  const submits: number[] = [];
  let looks = 0;
  // The site refuses the first `refusals` submissions (all of them with just `refused`).
  let refusalsLeft = opts.refusals ?? (opts.refused ? Infinity : 0);
  let refusing = refusalsLeft > 0;
  const driver: FormDriver = {
    open: async () => "ok",
    fill: async (step: FillStep) => {
      if (opts.unfillable?.includes(step.fieldName)) return false;
      // A box that won't take this one value (a search that finds nothing for it).
      if ("value" in step && opts.rejects?.[step.fieldName] === step.value) return false;
      filled[step.fieldName] = step.kind === "text" ? step.value : step.kind === "select" ? step.value.join(", ") : "resume.pdf";
      return true;
    },
    values: async () => ({ ...filled, ...opts.edits }),
    // Required fields the plan didn't cover, until filled.
    openFields: async (known: string[]) => (opts.open ?? []).filter((f) => !known.includes(f.key) && !(f.key in filled)),
    challenge: async () => opts.challenge ?? false,
    emailCode: async () => false,
    enterEmailCode: async () => true,
    confirmation: async () => (!opts.neverSubmitted && !refusing && ++looks > 1 ? "Thank you for applying." : null),
    refused: async () => (refusing ? (opts.refused ?? "flagged as possible spam") : null),
    submit: async () => {
      submits.push(Date.now());
      refusing = --refusalsLeft > 0;
    },
    screenshot: async () => PNG,
    focus: async () => {},
    closed: () => false,
  };
  return { driver, filled, submits };
}

/** A form in pages over the fake browser: each page's questions show what's been filled in; Next goes on to review. */
function pagedDriver(fake: ReturnType<typeof fakeDriver>, pages: PageQuestion[][]) {
  let at = 0;
  const moves: string[] = [];
  const state = { discarded: false };
  const driver: FormDriver = {
    ...fake.driver,
    pageQuestions: async () => (pages[at] ?? []).map((q) => (q.key in fake.filled ? { ...q, value: fake.filled[q.key].split(", ") } : q)),
    nextPage: async () => {
      at++;
      const where = at < pages.length ? "next" : "review";
      moves.push(where);
      return where;
    },
    discard: async () => (state.discarded = true),
  };
  return {
    driver, moves,
    get discarded() {
      return state.discarded;
    },
  };
}

/** Claude's answers from your profile, by field. */
const answers = (by: Record<string, string[]>) => async (input: { fields: OpenField[] }): Promise<FieldAnswer[]> =>
  input.fields.filter((f) => by[f.key]).map((f) => ({ key: f.key, value: by[f.key], category: "fact", reason: "from your profile" }));

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
  await db.from("field_mappings").delete().eq("user_id", userId).eq("company", `apply${tag}`);
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

  it("records an optional field it couldn't fill and says so in the note", async () => {
    const id = await addApproved("skipped");
    const [job] = (await listReadyToApply(db, userId, ["greenhouse"])).filter((a) => a.id === id);
    const outcome = await applyOne(
      { ...deps(fakeDriver({ unfillable: ["question_9", "country"] }).driver), extraSteps: [{ kind: "select", fieldName: "country", label: "Country", required: false, value: ["United States"] }] },
      job,
    );
    expect(outcome).toMatchObject({ result: "submitted" });
    expect((await app(id)).apply_note).toBe(`Submitted by the apply runner. It couldn't fill "Sponsorship?".`);
    const { data: evidence } = await db.from("application_evidence_items").select("detail").eq("application_id", id).eq("kind", "screenshot").single();
    expect(evidence?.detail).toMatchObject({ skipped: ["Sponsorship?"] });
  });

  it("fills the rest around a required field that wouldn't take its value and waits for you, even in auto mode", async () => {
    const id = await addApproved("wouldnt-take");
    const before = await streak();
    await db.from("platforms").upsert({ user_id: userId, ats: "greenhouse", mode: "auto", clean_streak: 3 }, { onConflict: "user_id,ats" });
    const [job] = (await listReadyToApply(db, userId, ["greenhouse"])).filter((a) => a.id === id);
    const { driver, filled, submits } = fakeDriver({ unfillable: ["first_name"] });
    const outcome = await applyOne(deps(driver), job);
    await db.from("platforms").update({ mode: "supervised", clean_streak: before?.clean_streak ?? 0 }).eq("user_id", userId).eq("ats", "greenhouse");
    // Not handed back: the rest is filled, and it waited for you instead of submitting.
    expect(outcome).toMatchObject({ result: "submitted" });
    expect(submits).toEqual([]);
    expect(filled).toHaveProperty("question_9", "No");
    const { data: evidence } = await db.from("application_evidence_items").select("detail").eq("application_id", id).eq("kind", "screenshot").single();
    expect(evidence?.detail).toMatchObject({ left_for_you: ["First Name"] });
  });

  it("submits once more when the site refuses a submission, as it asks, and is then received", async () => {
    const id = await addApproved("refused-once");
    const [job] = (await listReadyToApply(db, userId, ["greenhouse"])).filter((a) => a.id === id);
    const { driver, submits, filled } = fakeDriver({ refused: "Your application submission was flagged as possible spam.", refusals: 1 });
    const outcome = await applyOne(deps(driver), job);
    expect(outcome).toMatchObject({ result: "submitted" });
    expect(submits).toHaveLength(1); // the runner's own second submit
    expect(filled).toHaveProperty("first_name", "Ada");
    expect((await app(id)).status).toBe("submitted");
  });

  it("hands back when the site refuses the second submission too", async () => {
    const id = await addApproved("refused-twice");
    const [job] = (await listReadyToApply(db, userId, ["greenhouse"])).filter((a) => a.id === id);
    const { driver, submits } = fakeDriver({ refused: "Your application submission was flagged as possible spam." });
    const outcome = await applyOne(deps(driver), job);
    expect(outcome).toMatchObject({ result: "handed_back", reason: expect.stringContaining("refused the submission twice") });
    expect(submits).toHaveLength(1);
    expect((await app(id)).status).toBe("manual");
  });

  it("skips without submitting again when the company's application limit is reached", async () => {
    const id = await addApproved("limit");
    const other = await addApproved("limit-other");
    const [job] = (await listReadyToApply(db, userId, ["greenhouse"])).filter((a) => a.id === id);
    const { driver, submits } = fakeDriver({ refused: "You have reached the application limit. We are limiting applications to a total of 2 jobs over a span of 60 days." });
    const outcome = await applyOne(deps(driver), job);
    expect(outcome).toMatchObject({ result: "handed_back", closeTab: true, reason: expect.stringContaining("won't take this application") });
    expect(submits).toHaveLength(0);
    expect((await app(id)).status).toBe("skipped");

    // The rule is saved on the company, you're paused there for its window, and the other one there waiting is skipped too.
    const { data: company } = await db.from("companies").select("apply_limit, apply_limit_days").eq("id", companyId).single();
    expect(company).toEqual({ apply_limit: 2, apply_limit_days: 60 });
    const { data: follow } = await db.from("user_companies").select("paused_until, pause_reason").eq("user_id", userId).eq("company_id", companyId).single();
    const days = (new Date(follow!.paused_until!).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(59);
    expect(follow!.pause_reason).toMatch(/takes 2 applications per 60 days/);
    expect((await app(other)).status).toBe("skipped");
    expect((await companiesAtLimit(db, userId, new Date())).has(companyId)).toBe(true);
    await db.from("user_companies").update({ paused_until: null, pause_reason: null }).eq("user_id", userId).eq("company_id", companyId);
    await db.from("companies").update({ apply_limit: null, apply_limit_days: null }).eq("id", companyId);
  });

  it("says it's filled before waiting for you, so the next one can be filled in another tab", async () => {
    const id = await addApproved("fillahead");
    const [job] = (await listReadyToApply(db, userId, ["greenhouse"])).filter((a) => a.id === id);
    const seen: string[] = [];
    const outcome = await applyOne({
      ...deps(fakeDriver({ neverSubmitted: true }).driver),
      waitMs: 0,
      log: (line) => seen.push(line),
      filled: () => seen.push("filled"),
    }, job);
    expect(outcome.result).toBe("handed_back");
    // Once, after filling and before the wait ran out.
    expect(seen.filter((l) => l === "filled")).toHaveLength(1);
    expect(seen.indexOf("filled")).toBeLessThan(seen.findIndex((l) => l.includes("handed back")));
  });

  it("frees the turn to fill once when it hands back before filling", async () => {
    const id = await addApproved("fillahead-blocked");
    const [job] = (await listReadyToApply(db, userId, ["greenhouse"])).filter((a) => a.id === id);
    let calls = 0;
    await applyOne({ ...deps(fakeDriver({ challenge: true }).driver), filled: () => calls++ }, job);
    expect(calls).toBe(1);
  });

  it("hands back and closes the tab when nobody submits in time", async () => {
    const id = await addApproved("timeout");
    const [job] = (await listReadyToApply(db, userId, ["greenhouse"])).filter((a) => a.id === id);
    const outcome = await applyOne({ ...deps(fakeDriver({ neverSubmitted: true }).driver), waitMs: 0 }, job);
    expect(outcome).toEqual({ result: "handed_back", reason: "Nobody submitted the form within 30 minutes.", closeTab: true });
    expect((await app(id)).status).toBe("manual");
  });

  it("hands back a form with a required question it can't answer", async () => {
    const id = await addApproved("blocked", { requiredUnanswered: true });
    const [job] = (await listReadyToApply(db, userId, ["greenhouse"])).filter((a) => a.id === id);
    const outcome = await applyOne(deps(fakeDriver().driver), job);
    expect(outcome).toMatchObject({ result: "handed_back" });
    expect(await app(id)).toMatchObject({ status: "manual", apply_step: null, apply_note: expect.stringContaining("Why us?") });
  });

  it("fills around a step only you can do and waits for you, even in auto mode", async () => {
    const id = await addApproved("yours", { yourStep: true });
    const before = await streak();
    await db.from("platforms").upsert({ user_id: userId, ats: "greenhouse", mode: "auto", clean_streak: 3 }, { onConflict: "user_id,ats" });
    const [job] = (await listReadyToApply(db, userId, ["greenhouse"])).filter((a) => a.id === id);
    const steps: string[] = [];
    const { driver, filled, submits } = fakeDriver();
    const outcome = await applyOne({ ...deps(driver), log: (l: string) => steps.push(l) }, job);
    await db.from("platforms").update({ mode: "supervised", clean_streak: before?.clean_streak ?? 0 }).eq("user_id", userId).eq("ats", "greenhouse");
    expect(submits).toEqual([]);
    expect(filled).not.toHaveProperty("question_11");
    expect(filled).toHaveProperty("first_name", "Ada");
    expect(outcome).toMatchObject({ result: "submitted" });
    const { data: events } = await db.from("application_events").select("to_status").eq("application_id", id);
    expect(events!.map((e) => e.to_status)).toContain("submitted");
  });

  it("hands back when a CAPTCHA shows, without submitting, and can be retried", async () => {
    const id = await addApproved("captcha");
    const [job] = (await listReadyToApply(db, userId, ["greenhouse"])).filter((a) => a.id === id);
    const outcome = await applyOne(deps(fakeDriver({ challenge: true }).driver), job);
    expect(outcome).toMatchObject({ result: "handed_back", reason: expect.stringContaining("verification") });
    expect((await app(id)).status).toBe("manual");

    await retryApply(db, userId, id);
    expect(await app(id)).toMatchObject({ status: "approved", apply_step: null, apply_note: null });
    expect((await listReadyToApply(db, userId, ["greenhouse"])).map((a) => a.id)).toContain(id);
    await expect(retryApply(db, userId, id)).rejects.toThrow(/handed back/);
  });

  it("moves an application by hand along the board, only where allowed", async () => {
    const id = await addApproved("moved");
    await moveApplication(db, userId, id, "submitted");
    await moveApplication(db, userId, id, "interviewing");
    expect((await app(id)).status).toBe("interviewing");
    await expect(moveApplication(db, userId, id, "responded")).rejects.toBeInstanceOf(IllegalTransitionError);
    await expect(moveApplication(db, userId, id, "approved")).rejects.toThrow(/can only be moved/);
    expect((await listUserMoves(db)).submitted).toEqual(expect.arrayContaining(["responded", "interviewing", "offer", "rejected"]));
  });

  it("moves the application it was stopped in the middle of to Runner stuck, and can retry it", async () => {
    const id = await addApproved("stopped");
    const idle = await addApproved("idle");
    await setApplyStep(db, id, "waiting_for_you", "Filled. Check the Chrome window and click Submit.");
    // Earlier cases may leave others mid-way; this one must be among them.
    expect(await handBackUnfinished(db, userId)).toBeGreaterThanOrEqual(1);
    expect(await app(id)).toEqual({ status: "manual", apply_step: null, apply_note: STOPPED_NOTE });
    expect((await app(idle)).status).toBe("approved");
    await retryApply(db, userId, id);
    expect((await app(id)).status).toBe("approved");
  });

  it("uploads a run record and shows it back, with any emailed code blanked", async () => {
    const id = await addApproved("runlog");
    const text = (s: string) => new TextEncoder().encode(s);
    await saveApplyRun(db, {
      userId,
      userName: "Ada Lovelace",
      applicationId: id,
      jobTitle: "Engineer runlog",
      companyName: `ApplyCo ${tag}`,
      startedAt: new Date(),
      outcome: "handed back: Couldn't fill \"Start year\".",
      files: [
        { name: "run.log", bytes: text("fill start-year--0 (text) \"Start year\" = \"2020\" -> NOT FILLED\nthe form shows a security code box: aB3dE9fG\n") },
        { name: "01-opened.png", bytes: PNG },
      ],
    });
    const [run] = await listApplyRuns(db, { applicationId: id });
    expect(run.outcome).toContain("Start year");
    expect(run.user.name).toBe("Ada Lovelace");
    expect(run.application).toEqual({ id, title: "Engineer runlog", company: `ApplyCo ${tag}` });
    const filters = await listRunFilters(db);
    expect(filters.jobs.find((j) => j.applicationId === id)).toMatchObject({ userId, title: "Engineer runlog", runs: 1 });
    expect((await listApplyRuns(db, { userId })).map((r) => r.id)).toContain(run.id);
    expect(run.log).toContain("NOT FILLED");
    expect(run.log).toContain("[code]");
    expect(run.log).not.toContain("aB3dE9fG");
    expect(run.shots.map((s) => s.name)).toEqual(["01-opened.png"]);
    const { data } = await db.from("apply_runs").select("folder").eq("application_id", id).single();
    await db.storage.from(APPLY_RUNS_BUCKET).remove([`${data!.folder}/run.log`, `${data!.folder}/01-opened.png`]);
  });

  it("goes through a form in pages (LinkedIn), answering each page's questions, and waits at review", async () => {
    const id = await addApproved("paged");
    const [job] = (await listReadyToApply(db, userId, ["greenhouse"])).filter((a) => a.id === id);
    const fake = fakeDriver();
    // Page 1 asks your name (answered in the app); page 2 asks one question; then the review page.
    const paged = pagedDriver(fake, [
      [{ key: "first_name", label: "First Name", kind: "text", options: [], value: [], required: true }],
      [{ key: "q:years of typescript", label: "Years of TypeScript", kind: "text", options: [], value: [], required: true }],
    ]);
    const before = await streak();
    try {
      expect(await applyOne({ ...deps(paged.driver), mapFields: answers({ "q:years of typescript": ["8"] }) }, job)).toMatchObject({ result: "submitted" });
      expect(paged.moves).toEqual(["next", "review"]);
      expect(fake.filled).toMatchObject({ first_name: "Ada", "q:years of typescript": "8" });
      expect(paged.discarded).toBe(false);
    } finally {
      // Left as the other tests expect: nothing learned, the streak as it was.
      await db.from("field_mappings").delete().eq("user_id", userId).in("field_name", ["q:years of typescript", "first_name", "question_9"]);
      await db.from("platforms").update({ clean_streak: before?.clean_streak ?? 0, mode: before?.mode ?? "supervised" }).eq("user_id", userId).eq("ats", "greenhouse");
    }
  });

  it("stops on a page it can't get past and leaves the rest to you", async () => {
    const id = await addApproved("paged-stuck");
    const [job] = (await listReadyToApply(db, userId, ["greenhouse"])).filter((a) => a.id === id);
    const fake = fakeDriver();
    const driver: FormDriver = { ...fake.driver, pageQuestions: async () => [], nextPage: async () => "stuck" };
    const before = await streak();
    await applyOne(deps(driver), job);
    await db.from("platforms").update({ clean_streak: before?.clean_streak ?? 0, mode: before?.mode ?? "supervised" }).eq("user_id", userId).eq("ats", "greenhouse");
    await db.from("field_mappings").delete().eq("user_id", userId).in("field_name", ["first_name", "question_9"]);
    const { data } = await db.from("application_events").select("detail").eq("application_id", id).eq("to_status", "submitted").single();
    expect(data).not.toBeNull();
    const { data: evidence } = await db.from("application_evidence_items").select("detail").eq("application_id", id).eq("kind", "screenshot").single();
    expect((evidence!.detail as { left_for_you: string[] }).left_for_you).toEqual(["a page of the form it couldn't get past"]);
  });

  it("goes past a question it can't answer with a stand-in, discards the form unsent and asks in the app", async () => {
    const id = await addApproved("paged-ask");
    const [job] = (await listReadyToApply(db, userId, ["greenhouse"])).filter((a) => a.id === id);
    const fake = fakeDriver();
    const paged = pagedDriver(fake, [
      [{ key: "q:clearance", label: "Do you hold a clearance?", kind: "select", options: ["Yes", "No"], value: [], required: true }],
      [
        { key: "q:years of go", label: "Years of Go", kind: "text", options: [], value: [], required: true },
        // Filled in by LinkedIn from an application before, and your profile says otherwise.
        { key: "q:years of python", label: "Years of Python", kind: "text", options: [], value: ["3"], required: true },
        { key: "phone", label: "Mobile phone number", kind: "text", options: [], value: ["7045550100"], required: true },
      ],
    ]);
    const asked: QuestionToAsk[][] = [];
    const askInApp = async (_id: string, questions: QuestionToAsk[]) => {
      asked.push(questions);
      return "needs_input";
    };
    const mapFields = answers({ "q:years of go": ["5"], "q:years of python": ["8"] });
    expect(await applyOne({ ...deps(paged.driver), mapFields, askInApp }, job)).toEqual({ result: "needs_answers", questions: 2 });
    // It saw every page (the clearance got a stand-in), never submitted, and closed the form with Discard.
    expect(paged.moves).toEqual(["next", "review"]);
    expect(fake.filled["q:clearance"]).toBe("Yes");
    expect(fake.submits).toHaveLength(0);
    expect(paged.discarded).toBe(true);
    expect(asked[0]).toEqual([
      { key: "q:clearance", label: "Do you hold a clearance?", kind: "select", options: ["Yes", "No"], required: true },
      { key: "q:years of python", label: "Years of Python", kind: "text", options: [], required: true, conflict: { form: "3", yours: "8" } },
      { key: "q:years of go", label: "Years of Go", kind: "text", options: [], required: true, answer: ["5"] },
    ]);
    const after = await app(id);
    expect(after.status).toBe("approved");
    expect(after.apply_note).toMatch(/discarded it unsent: 1 question to answer and 1 where LinkedIn had something else filled in/);
  });

  it("on LinkedIn with the resume on LinkedIn chosen, fills without a resume of its own and uploads none", async () => {
    const id = await addApproved("paged-onfile");
    const { data: row } = await db.from("applications").select("job_id").eq("id", id).single();
    await db.from("jobs").update({ source: "linkedin" }).eq("id", row!.job_id);
    await db.from("resumes").delete().eq("application_id", id);
    await db.from("user_settings").upsert({ user_id: userId, key: "linkedin_resume_on_file", value: true }, { onConflict: "user_id,key" });
    const [job] = (await listReadyToApply(db, userId, ["linkedin"])).filter((a) => a.id === id);
    const fake = fakeDriver();
    const paged = pagedDriver(fake, [[{ key: "first_name", label: "First Name", kind: "text", options: [], value: [], required: true }]]);
    const resumes: string[] = [];
    const driver: FormDriver = { ...paged.driver, nextPage: async (resumePath) => (resumes.push(resumePath), paged.driver.nextPage!(resumePath)) };
    let saved = 0;
    try {
      const out = await applyOne({ ...deps(driver), saveResume: async () => (saved++, "/tmp/resume.pdf") }, job);
      expect(out).toMatchObject({ result: "submitted" });
      expect(resumes).toEqual([""]);
      expect(saved).toBe(0);
    } finally {
      await db.from("user_settings").delete().eq("user_id", userId).eq("key", "linkedin_resume_on_file");
      await db.from("field_mappings").delete().eq("user_id", userId).in("field_name", ["first_name", "question_9"]);
      await db.from("platforms").delete().eq("user_id", userId).eq("ats", "linkedin");
    }
  });

  it("puts your answer from the app over what LinkedIn had filled in", async () => {
    const id = await addApproved("paged-yours");
    await db.from("application_questions").insert({ application_id: id, bucket: "auto", question: "Years of Python", field_name: "q:years of python", field_type: "text", answer: "8", required: true, sort_order: 5, options: null, answer_value: null });
    const [job] = (await listReadyToApply(db, userId, ["greenhouse"])).filter((a) => a.id === id);
    const fake = fakeDriver();
    const paged = pagedDriver(fake, [[{ key: "q:years of python", label: "Years of Python", kind: "text", options: [], value: ["3"], required: true }]]);
    let askedClaude = false;
    const mapFields = async () => {
      askedClaude = true;
      return [];
    };
    const before = await streak();
    try {
      expect(await applyOne({ ...deps(paged.driver), mapFields, askInApp: async () => "x" }, job)).toMatchObject({ result: "submitted" });
      expect(fake.filled["q:years of python"]).toBe("8");
      expect(askedClaude).toBe(false);
      // Kept for every LinkedIn form that asks it (here, under this job's board).
      const { data } = await db.from("field_mappings").select("value, learned, source").eq("user_id", userId).eq("field_name", "q:years of python").single();
      expect(data).toEqual({ value: ["8"], learned: true, source: "you" });
    } finally {
      await db.from("field_mappings").delete().eq("user_id", userId).in("field_name", ["q:years of python", "first_name", "question_9"]);
      await db.from("platforms").update({ clean_streak: before?.clean_streak ?? 0, mode: before?.mode ?? "supervised" }).eq("user_id", userId).eq("ats", "greenhouse");
    }
  });

  it("fills a field it didn't prepare for by AI and waits for you even in auto mode, until it's learned", async () => {
    const before = await streak();
    await db.from("platforms").upsert({ user_id: userId, ats: "greenhouse", mode: "auto", clean_streak: 3 }, { onConflict: "user_id,ats" });
    const open: OpenField[] = [{ key: "company-name-0", label: "Company name", kind: "text", options: [] }];
    const asked: string[][] = [];
    const mapFields = async (input: { fields: OpenField[] }): Promise<FieldAnswer[]> => {
      asked.push(input.fields.map((f) => f.key));
      return [{ key: "company-name-0", value: ["Acme"], category: "fact", reason: "current employer" }];
    };
    const runOnce = async (key: string) => {
      const id = await addApproved(key);
      const [job] = (await listReadyToApply(db, userId, ["greenhouse"])).filter((a) => a.id === id);
      const fake = fakeDriver({ open });
      const outcome = await applyOne({ ...deps(fake.driver), mapFields }, job);
      return { outcome, fake };
    };
    try {
      // Twice by AI: filled, but held for you (no automatic submit), and kept as filled.
      for (const key of ["ai1", "ai2"]) {
        const { outcome, fake } = await runOnce(key);
        expect(outcome).toMatchObject({ result: "submitted" });
        expect(fake.filled["company-name-0"]).toBe("Acme");
        expect(fake.submits).toEqual([]);
      }
      expect(asked).toEqual([["company-name-0"], ["company-name-0"]]);
      const { data: mapping } = await db.from("field_mappings").select("confirmations, learned").eq("user_id", userId).eq("company", `apply${tag}`).single();
      expect(mapping).toEqual({ confirmations: 2, learned: true });
      // Learned: filled without asking Claude, and auto mode submits by itself.
      const { fake } = await runOnce("ai3");
      expect(asked).toHaveLength(2);
      expect(fake.filled["company-name-0"]).toBe("Acme");
      expect(fake.submits).toHaveLength(1);
    } finally {
      await db.from("platforms").update({ mode: "supervised", clean_streak: before?.clean_streak ?? 0 }).eq("user_id", userId).eq("ats", "greenhouse");
    }
  });

  it("tries Claude's other wordings when a field won't take its value, holds that for you, then learns it", async () => {
    const before = await streak();
    await db.from("platforms").upsert({ user_id: userId, ats: "greenhouse", mode: "auto", clean_streak: 3 }, { onConflict: "user_id,ats" });
    await db.from("field_mappings").delete().eq("user_id", userId).eq("company", `apply${tag}`).eq("field_name", "first_name");
    const asked: string[] = [];
    // "Ada" finds nothing in this box; Claude's second suggestion does.
    const alternatives = async (input: { value: string }) => {
      asked.push(input.value);
      return ["A.", "Augusta Ada"];
    };
    const runOnce = async (key: string) => {
      const id = await addApproved(key);
      const [job] = (await listReadyToApply(db, userId, ["greenhouse"])).filter((a) => a.id === id);
      const fake = fakeDriver({ rejects: { first_name: "Ada" } });
      fake.driver.fill = ((orig) => async (step: FillStep, resume: string) => ("value" in step && step.value === "A." ? false : orig(step, resume)))(fake.driver.fill);
      const outcome = await applyOne({ ...deps(fake.driver), alternatives }, job);
      return { outcome, fake, id };
    };
    try {
      for (const key of ["alt1", "alt2"]) {
        const { outcome, fake } = await runOnce(key);
        expect(outcome).toMatchObject({ result: "submitted", changed: [] });
        expect(fake.filled.first_name).toBe("Augusta Ada");
        expect(fake.submits).toEqual([]); // held for you to check
      }
      expect(asked).toEqual(["Ada", "Ada"]);
      const { data: mapping } = await db.from("field_mappings").select("value, confirmations, learned").eq("user_id", userId).eq("company", `apply${tag}`).eq("field_name", "first_name").single();
      expect(mapping).toEqual({ value: ["Augusta Ada"], confirmations: 2, learned: true });
      // Learned: tried first, no Claude, and auto mode submits by itself.
      const { fake } = await runOnce("alt3");
      expect(asked).toHaveLength(2);
      expect(fake.filled.first_name).toBe("Augusta Ada");
      expect(fake.submits).toHaveLength(1);
    } finally {
      await db.from("platforms").update({ mode: "supervised", clean_streak: before?.clean_streak ?? 0 }).eq("user_id", userId).eq("ats", "greenhouse");
    }
  });

  it("refuses auto mode until the streak is earned", async () => {
    await expect(setPlatformMode(db, userId, "greenhouse", "auto")).rejects.toThrow(/auto needs 3 clean runs/);
  });
});
