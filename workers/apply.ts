// Apply runner: runs on your own computer, never on Railway. Signs in as you,
// so it sees only your applications, and fills approved ones in a visible
// Chrome window. On a supervised platform you click Submit; it records the
// evidence and marks the application submitted.
//   pnpm worker:apply          (reads .env.local, then .env.apply if present)
// Needs SUPABASE_URL and SUPABASE_ANON_KEY. The first run asks for your email
// and password; only the refreshable session is kept, in data/apply-session.json.
// Chrome uses its own profile in data/apply-chrome, so sign-ins you make there stay.
// Chrome opens when there's an application to fill and closes again once nothing
// is left open for you (a submitted tab closes 10 seconds after the thank-you page).
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { createClient } from "@supabase/supabase-js";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import type { Database } from "@/server/db/database.types";
import type { Db } from "@/server/db/types";
import { ashbyDriver } from "@/server/integrations/browser/ashby-driver";
import { greenhouseDriver } from "@/server/integrations/browser/greenhouse-driver";
import { leverDriver } from "@/server/integrations/browser/lever-driver";
import { recordRun } from "@/server/integrations/browser/run-recorder";
import { codeInbox } from "@/server/integrations/email/code-inbox";
import { listReadyToApply } from "@/server/modules/apply/apply.repository";
import { greenhouseExtras, type HomePlace, type Schooling, type WorkRole } from "@/server/modules/apply/fill-plan";
import { usStateName } from "@/server/modules/criteria/places";
import { APPLY_ATS, applyOne, handBackUnfinished, type ApplyDeps } from "@/server/modules/apply/apply.service";
import { saveApplyRun, type RunFile } from "@/server/modules/apply/apply-runs";
import { parseApplyEnv } from "@/shared/env";

const DATA = path.resolve("data");
const SESSION_FILE = path.join(DATA, "apply-session.json");
const POLL_MS = 20_000;
/** How long a submitted tab stays open, so the thank-you page can be seen. */
const SUBMITTED_TAB_MS = 10_000;

const log = (line: string) => console.log(`[${new Date().toLocaleTimeString()}] ${line}`);

/** Supabase auth storage backed by one JSON file, so the session survives restarts. */
function fileStorage() {
  const read = async (): Promise<Record<string, string>> => JSON.parse(await readFile(SESSION_FILE, "utf8").catch(() => "{}"));
  return {
    getItem: async (key: string) => (await read())[key] ?? null,
    setItem: async (key: string, value: string) => {
      await mkdir(DATA, { recursive: true });
      await writeFile(SESSION_FILE, JSON.stringify({ ...(await read()), [key]: value }), { mode: 0o600 });
    },
    removeItem: async (key: string) => {
      const all = await read();
      delete all[key];
      await writeFile(SESSION_FILE, JSON.stringify(all), { mode: 0o600 });
    },
  };
}

/** Asks for email and password in the terminal; the password isn't echoed. */
async function askLogin(): Promise<{ email: string; password: string }> {
  let muted = false;
  const output = new Writable({
    write(chunk, _enc, done) {
      if (!muted) process.stdout.write(chunk);
      done();
    },
  });
  // One interface for both answers, so piped input isn't consumed by the first.
  const rl = createInterface({ input: process.stdin, output, terminal: process.stdin.isTTY });
  const email = await rl.question("Email: ");
  const pending = rl.question("Password: ");
  muted = true;
  const password = await pending;
  rl.close();
  process.stdout.write("\n");
  return { email: email.trim(), password };
}

/** Signs in with the saved session, or asks for email and password once. */
async function signIn(db: Db): Promise<string> {
  const { data } = await db.auth.getUser();
  if (data.user) return data.user.id;
  console.log("Sign in to Jobrx (asked once; only the session is saved).");
  const { email, password } = await askLogin();
  const res = await db.auth.signInWithPassword({ email, password });
  if (res.error || !res.data.user) throw new Error(`sign in failed: ${res.error?.message ?? "no user"}`);
  return res.data.user.id;
}

/** Your name (for the resume file name), where you live (Country and Location fields) and your first education. */
async function profileBasics(db: Db, userId: string): Promise<{ name: string; home: HomePlace; school: Schooling | null; role: WorkRole | null }> {
  const [{ data }, { data: edu }, { data: job }] = await Promise.all([
    db.from("profiles").select("first_name, last_name, city, state").eq("user_id", userId).maybeSingle(),
    db.from("educations").select("institution, degree, field_of_study, start_year, end_year").eq("user_id", userId)
      .order("sort_order").order("end_year", { ascending: false, nullsFirst: true }).limit(1).maybeSingle(),
    // The most recent job: a current one first, then by start date.
    db.from("employments").select("employer, title, start_date, end_date, is_current").eq("user_id", userId)
      .order("is_current", { ascending: false }).order("start_date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return {
    name: [data?.first_name, data?.last_name].filter(Boolean).join(" ") || "Resume",
    home: { city: data?.city ?? null, stateName: usStateName(data?.state), country: "United States" },
    school: edu ? { institution: edu.institution, degree: edu.degree, fieldOfStudy: edu.field_of_study, startYear: edu.start_year, endYear: edu.end_year } : null,
    role: job ? { employer: job.employer, title: job.title, startDate: job.start_date, endDate: job.end_date, isCurrent: job.is_current } : null,
  };
}

/** Your job inbox's address (the job_inbox setting), where forms email security codes. */
async function jobInboxAddress(db: Db, userId: string): Promise<string | null> {
  const { data } = await db.from("user_settings").select("value").eq("user_id", userId).eq("key", "job_inbox").maybeSingle();
  const address = (data?.value as { address?: unknown } | null)?.address;
  return typeof address === "string" ? address : null;
}

/**
 * Uploads a run record (its log, screenshots and the form's HTML) for the application's page.
 * Best effort: the local copy stays either way.
 */
async function uploadRunWith(
  db: Db,
  who: { userId: string; userName: string },
  dir: string,
  app: { id: string; job: { title: string; company_name: string } },
  startedAt: Date,
  outcome: string,
) {
  try {
    const names = (await readdir(dir)).sort();
    const files: RunFile[] = await Promise.all(names.map(async (name) => ({ name, bytes: new Uint8Array(await readFile(path.join(dir, name))) })));
    await saveApplyRun(db, { ...who, applicationId: app.id, jobTitle: app.job.title, companyName: app.job.company_name, startedAt, outcome, files });
  } catch (err) {
    log(`${app.id}: couldn't upload the run record: ${(err as Error).message}`);
  }
}

async function main() {
  const env = parseApplyEnv(process.env);
  const db: Db = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { storage: fileStorage(), persistSession: true, autoRefreshToken: true, storageKey: "apply-runner" },
  });
  const userId = await signIn(db);
  const { name, home, school, role } = await profileBasics(db, userId);
  // Required fields a form still has empty: the web app answers them from your profile with Claude.
  /** Asks the app (signed in as you) for something only the server can do, like a Claude call. */
  const askApp = async <T,>(path: string, input: unknown): Promise<T> => {
    const token = (await db.auth.getSession()).data.session?.access_token;
    if (!token) throw new Error("not signed in");
    const res = await fetch(new URL(path, env.APPLY_APP_URL), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`the app answered ${res.status}`);
    return (await res.json()) as T;
  };
  const mapFields: NonNullable<ApplyDeps["mapFields"]> = async (input) =>
    (await askApp<{ answers: Awaited<ReturnType<NonNullable<ApplyDeps["mapFields"]>>> }>("/api/runner/map-fields", input)).answers;
  const alternatives: NonNullable<ApplyDeps["alternatives"]> = async (input) =>
    (await askApp<{ alternatives: string[] }>("/api/runner/alternatives", input)).alternatives;
  const uploadRun = (dir: string, app: { id: string; job: { title: string; company_name: string } }, startedAt: Date, outcome: string) =>
    uploadRunWith(db, { userId, userName: name }, dir, app, startedAt, outcome);
  const stale = await handBackUnfinished(db, userId);
  if (stale) log(`moved ${stale} application(s) an earlier run left mid-way to Runner stuck`);

  let browser: BrowserContext | null = null;
  /** Chrome, opened if it isn't (closed by the runner, by you, or with its last tab, it opens again). */
  const chrome = async (): Promise<BrowserContext> => {
    if (browser) return browser;
    const ctx = await chromium.launchPersistentContext(path.join(DATA, "apply-chrome"), { channel: "chrome", headless: false, viewport: null });
    ctx.on("close", () => {
      if (browser === ctx) browser = null;
    });
    browser = ctx;
    return ctx;
  };
  /** A tab for the next form: the blank one Chrome opens with, or a new one. */
  const newTab = async (): Promise<Page> => {
    const ctx = await chrome();
    return ctx.pages().find((p) => p.url() === "about:blank") ?? ctx.newPage();
  };
  /** Closes Chrome when every tab is closed or blank: nothing is being filled or left for you. */
  const closeIfIdle = async () => {
    if (!browser || browser.pages().some((p) => !p.isClosed() && p.url() !== "about:blank")) return;
    await browser.close().catch(() => undefined);
    browser = null;
  };
  const files = path.join(tmpdir(), "job-search-autopilot-apply");
  await mkdir(files, { recursive: true });
  const saveResume = async (pdf: Uint8Array, fileName: string) => {
    const file = path.join(files, fileName.replace(/[^\w .-]/g, ""));
    await writeFile(file, pdf);
    return file;
  };

  let stopping = false;
  // Stopping hands back the open application right away (it may be waiting up to an hour for you),
  // closes Chrome and exits; a second Ctrl+C exits without waiting.
  const stop = async () => {
    if (stopping) process.exit(130);
    stopping = true;
    log("stopping: moving the open application to Runner stuck");
    const moved = await handBackUnfinished(db, userId).catch((err) => {
      log(`couldn't hand back: ${(err as Error).message}`);
      return 0;
    });
    if (moved) log(`moved ${moved} application(s) to Runner stuck`);
    await rm(files, { recursive: true, force: true }).catch(() => undefined);
    await (browser as BrowserContext | null)?.close().catch(() => undefined);
    log("apply runner stopped");
    process.exit(0);
  };
  // SIGBREAK is Ctrl+Break on Windows; SIGHUP is the terminal window closing.
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"] as const) process.on(signal, () => void stop());
  // With the job inbox's password, the security code a form emails is read and entered for you.
  const inboxUser = env.APPLY_IMAP_USER ?? (await jobInboxAddress(db, userId));
  const inbox = inboxUser && env.JOB_INBOX_PASSWORD
    ? codeInbox({ host: env.APPLY_IMAP_HOST, port: env.APPLY_IMAP_PORT, user: inboxUser, password: env.JOB_INBOX_PASSWORD }, log)
    : null;
  log(`apply runner started for ${name}; watching for approved ${APPLY_ATS.join(", ")} applications (Ctrl+C to stop)`);
  log(inbox ? `emailed security codes are read from ${inboxUser}` : "emailed security codes: you type them (no job inbox address or JOB_INBOX_PASSWORD)");

  while (!stopping) {
    try {
      const ready = await listReadyToApply(db, userId, APPLY_ATS);
      for (const app of ready) {
        if (stopping) break;
        const page = await newTab();
        // One driver per job site; Greenhouse forms also get the fields outside their question list.
        const greenhouse = app.job.source === "greenhouse";
        const driver = app.job.source === "ashby" ? ashbyDriver(page) : app.job.source === "lever" ? leverDriver(page) : greenhouseDriver(page);
        const record = await recordRun(path.join(DATA, "apply-debug"), app.id, page, driver);
        const both = (line: string) => {
          log(line);
          record.log(line);
        };
        let outcome = "error";
        let closeTab = false;
        try {
          const result = await applyOne({ db, userId, driver: record.driver, extraSteps: greenhouse ? greenhouseExtras(home, school, role) : [], readEmailCode: inbox?.waitForCode, mapFields, alternatives, saveResume, fullName: name, log: both }, app);
          outcome = result.result === "submitted" ? "submitted" : `handed back: ${result.reason}`;
          // Submitted tabs are finished with (after a moment to see the thank-you page); handed-back
          // ones stay open for you, except a form nobody submitted in time, reopened from the app.
          if (result.result === "submitted") setTimeout(() => void page.close().catch(() => undefined), SUBMITTED_TAB_MS);
          else if (result.closeTab) closeTab = true;
        } catch (err) {
          both(`${app.id}: failed: ${(err as Error).message}`);
        }
        const dir = await record.finish(outcome);
        log(`${app.id}: run record in ${path.relative(process.cwd(), dir)}`);
        // Also to the app, so the application's page shows it (and anyone helping you can see it).
        await uploadRun(dir, app, record.startedAt, outcome);
        // Closed after the record is finished, so its last screenshot and the form's HTML are kept.
        if (closeTab) await page.close().catch(() => undefined);
      }
      if (ready.length === 0) await closeIfIdle();
    } catch (err) {
      log(`poll failed: ${(err as Error).message}`);
    }
    for (let waited = 0; waited < POLL_MS && !stopping; waited += 500) await new Promise((r) => setTimeout(r, 500));
  }
  await rm(files, { recursive: true, force: true });
  // Set inside chrome(), which TypeScript can't follow from here.
  await (browser as BrowserContext | null)?.close().catch(() => undefined);
  log("apply runner stopped");
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
