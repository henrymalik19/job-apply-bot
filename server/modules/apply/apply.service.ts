// The apply runner's flow for one approved application: fill the form, record
// evidence, let the user submit (or submit on a trusted platform), record the
// confirmation and mark it submitted. Anything it can't do is handed back as
// Apply yourself with the reason; it never works around CAPTCHAs or bot checks.
import type { Db, Json } from "@/server/db/types";
import { ValidationError } from "@/server/core/errors";
import { getApplication, transition } from "@/server/modules/applications/applications.repository";
import {
  addEvidence,
  downloadResume,
  getPlatform,
  listPlatforms,
  setApplyStep,
  updatePlatform,
  type ApplyJob,
  type Platform,
} from "./apply.repository";
import { buildFillPlan, changedFields, type FillStep } from "./fill-plan";

/** ATSs the runner can fill (by field name). */
export const APPLY_ATS = ["greenhouse"] as const;

/** What the runner needs from a browser tab with an application form open. */
export interface FormDriver {
  /** Opens the form; "no_form" when the page has none (closed posting, login wall). */
  open(url: string): Promise<"ok" | "no_form">;
  /** Fills one field; false when the field or the option isn't on the page. */
  fill(step: FillStep, resumePath: string): Promise<boolean>;
  /** Each step's current value as shown on the page, by field name (unreadable fields left out). */
  values(steps: FillStep[]): Promise<Record<string, string>>;
  /** A CAPTCHA or bot check is showing and needs a person. */
  challenge(): Promise<boolean>;
  /** The form asks for a code it emailed to the applicant before it accepts the submit. */
  emailCode(): Promise<boolean>;
  /** Types the emailed code and submits again; false when there's nowhere to type it. */
  enterEmailCode(code: string): Promise<boolean>;
  /** The page says the application was received; its text, or null. */
  confirmation(): Promise<string | null>;
  /** Clicks the form's submit button. */
  submit(): Promise<void>;
  screenshot(): Promise<Uint8Array>;
  /** Brings the window to the front. */
  focus(): Promise<void>;
  /** The user closed the tab. */
  closed(): boolean;
}

/** Everything one application run needs. */
export type ApplyDeps = {
  db: Db;
  userId: string;
  driver: FormDriver;
  /** Fields the form adds outside the job's question list (Country, Location), filled first unless the plan has them. */
  extraSteps?: FillStep[];
  /** Writes the resume to a local file and returns its path. */
  saveResume: (pdf: Uint8Array, fileName: string) => Promise<string>;
  /** Your name, for the resume's file name. */
  fullName: string;
  log: (line: string) => void;
  /**
   * Reads the code a form emailed you, from your inbox: mail after `since`, for `company`.
   * Null when none arrives in time; without it you type the code yourself.
   */
  readEmailCode?: (since: Date, company: string) => Promise<string | null>;
  /** How long to wait for the user to submit (default 30 minutes). */
  waitMs?: number;
  /** How often to look at the page while waiting (default 2 seconds). */
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

/** How one run ended. */
export type ApplyOutcome =
  | { result: "submitted"; changed: string[] }
  /** closeTab: nobody is using the tab any more (the wait timed out); otherwise it stays open to finish by hand. */
  | { result: "handed_back"; reason: string; closeTab?: boolean };

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The hosted form URL of a posting on a supported ATS. */
export function formUrl(job: ApplyJob["job"]): string | null {
  if (job.source === "greenhouse" && job.board_token) {
    // The embed page serves the form itself; the hosted job page redirects companies with
    // their own careers site (Pinterest, say) to it, where the form sits in an iframe.
    return `https://job-boards.greenhouse.io/embed/job_app?for=${encodeURIComponent(job.board_token)}&token=${encodeURIComponent(job.external_id)}`;
  }
  return null;
}

/** Hands an application back to the user as Apply yourself, with the reason. */
async function handBack(deps: ApplyDeps, app: ApplyJob, reason: string): Promise<Extract<ApplyOutcome, { result: "handed_back" }>> {
  deps.log(`${app.id}: handed back: ${reason}`);
  await setApplyStep(deps.db, app.id, null, reason);
  await transition(deps.db, app.id, "manual", "worker:handback", { reason });
  return { result: "handed_back", reason };
}

/**
 * Reads the emailed code from your inbox and enters it. The mail can land a little
 * before the form shows the code box, so mail from the last few minutes counts.
 *
 * @returns Whether the code was entered (and the form submitted again).
 */
async function enterCodeFromInbox(deps: ApplyDeps, app: ApplyJob): Promise<boolean> {
  if (!deps.readEmailCode) return false;
  await setApplyStep(deps.db, app.id, "submitting", "The form emailed a code; reading it from your inbox.");
  deps.log(`${app.id}: the form asks for an emailed code; checking the inbox`);
  const code = await deps.readEmailCode(new Date(Date.now() - 5 * 60_000), app.job.company_name);
  if (!code) {
    deps.log(`${app.id}: no code arrived in the inbox`);
    return false;
  }
  const entered = await deps.driver.enterEmailCode(code);
  deps.log(`${app.id}: ${entered ? "entered the emailed code and submitted" : "found the code but no box to type it in"}`);
  return entered;
}

/** How long a form with a step only you can do (an assessment) stays open for you; the runner waits meanwhile. */
const YOUR_STEPS_WAIT_MS = 60 * 60_000;

/**
 * Waits for the confirmation page, keeping the last field values seen so
 * changes the user made can be found afterwards.
 */
async function waitForConfirmation(deps: ApplyDeps, steps: FillStep[], app: ApplyJob, platform: Platform, waitMs?: number) {
  const { driver } = deps;
  const sleep = deps.sleep ?? defaultSleep;
  const pollMs = deps.pollMs ?? 2000;
  const deadline = Date.now() + (deps.waitMs ?? waitMs ?? 30 * 60_000);
  let last: Record<string, string> = {};
  let askedForCheck = false;
  let askedForCode = false;
  while (Date.now() < deadline) {
    if (driver.closed()) return { closed: true as const };
    const text = await driver.confirmation();
    if (text != null) return { text, last };
    if (platform.mode === "auto" && !askedForCheck && (await driver.challenge())) {
      // A check after an automatic submit is the user's to complete, never the runner's.
      askedForCheck = true;
      await setApplyStep(deps.db, app.id, "waiting_for_you", "Complete the verification check in the Chrome window.");
      await driver.focus();
    }
    if (!askedForCode && (await driver.emailCode())) {
      askedForCode = true;
      if (!(await enterCodeFromInbox(deps, app))) {
        await setApplyStep(deps.db, app.id, "waiting_for_you", "The form emailed you a code. Enter it in the Chrome window to finish submitting.");
        await driver.focus();
      }
    }
    try {
      last = { ...last, ...(await driver.values(steps)) };
    } catch {
      // The page is navigating (submit in progress); keep the last values.
    }
    await sleep(pollMs);
  }
  return { timedOut: true as const };
}

/**
 * Fills and submits one approved application. An unexpected error (the page
 * changed, Chrome crashed) hands it back too, so nothing is left half-done.
 *
 * @returns Submitted (with the fields the user changed), or handed back with the reason.
 */
export async function applyOne(deps: ApplyDeps, app: ApplyJob): Promise<ApplyOutcome> {
  try {
    return await run(deps, app);
  } catch (err) {
    // The note keeps the first line; the terminal gets the whole trace to debug from.
    deps.log(`${app.id}: error: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    return handBack(deps, app, `The apply runner hit an error: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
  }
}

async function run(deps: ApplyDeps, app: ApplyJob): Promise<ApplyOutcome> {
  const { db, userId, driver, log } = deps;
  const where = `${app.job.title} at ${app.job.company_name}`;
  const url = formUrl(app.job);
  if (!url) return handBack(deps, app, `The runner can't fill ${app.job.source} forms yet.`);

  const plan = buildFillPlan(app.questions);
  const known = new Set(plan.steps.map((s) => s.fieldName));
  // Extras go first (Country before the phone it formats) and aren't checked for your edits.
  const steps = [...(deps.extraSteps ?? []).filter((s) => !known.has(s.fieldName)), ...plan.steps];
  if (plan.blockers.length) return handBack(deps, app, `Can't fill the form: ${plan.blockers.join("; ")}.`);
  if (!app.resume?.pdf_path) return handBack(deps, app, "No resume PDF was prepared for this application.");

  const platform = await getPlatform(db, userId, app.job.source);
  // A failure on a trusted platform puts it back under supervision.
  const fail = async (reason: string) => {
    if (platform.mode === "auto") await updatePlatform(db, userId, app.job.source, { clean_streak: 0, mode: "supervised" });
    return handBack(deps, app, reason);
  };

  await setApplyStep(db, app.id, "filling", `Filling the form for ${where}.`);
  log(`${app.id}: filling ${where}`);
  const resumePath = await deps.saveResume(await downloadResume(db, app.resume.pdf_path), `${deps.fullName} Resume.pdf`);

  if ((await driver.open(url)) === "no_form") return handBack(deps, app, "The posting has no application form (it may have closed).");
  const missed: string[] = [];
  // Optional questions it couldn't fill; extras are left out, since most forms lack some of them.
  const skipped: string[] = [];
  for (const step of steps) {
    if (await driver.fill(step, resumePath)) continue;
    if (step.required) missed.push(step.label);
    else if (known.has(step.fieldName)) skipped.push(step.label);
  }
  const except = skipped.length ? ` It couldn't fill ${skipped.map((m) => `"${m}"`).join(", ")}.` : "";
  // Steps only you can do (an assessment, a file to attach): everything else is filled, then it waits for you.
  const yours = plan.yours.length ? ` ${plan.yours.map((m) => `"${m}"`).join(", ")} ${plan.yours.length === 1 ? "is" : "are"} yours to do.` : "";
  if (missed.length) {
    return fail(`Couldn't fill ${missed.map((m) => `"${m}"`).join(", ")}. Finish it in the open Chrome window, or from the job page.`);
  }
  if (await driver.challenge()) return fail("The form shows a verification check. Finish it in the open Chrome window.");

  const answers = steps.map((s) => ({ field: s.fieldName, label: s.label, value: s.kind === "resume" ? "resume" : s.kind === "decline" ? "declined" : s.value }));
  await addEvidence(db, {
    userId,
    applicationId: app.id,
    kind: "screenshot",
    png: await driver.screenshot(),
    detail: { answers, skipped, resume_sha256: app.resume.sha256 } as Json,
  });

  if (platform.mode === "auto" && !yours) {
    await setApplyStep(db, app.id, "submitting", `Submitting the form for ${where}.`);
    await driver.submit();
  } else {
    await setApplyStep(db, app.id, "waiting_for_you", `Filled.${yours}${except} ${yours ? "Do that in the Chrome window, then click Submit." : "Check the Chrome window and click Submit."}`);
    await driver.focus();
  }

  const waited = await waitForConfirmation(deps, plan.steps, app, platform, yours ? YOUR_STEPS_WAIT_MS : undefined);
  if ("closed" in waited) return fail("The Chrome tab was closed before submitting.");
  if ("timedOut" in waited) return { ...(await fail(`Nobody submitted the form within ${yours ? "an hour" : "30 minutes"}.`)), closeTab: true };

  const changed = platform.mode === "auto" ? [] : changedFields(plan.steps, waited.last);
  await addEvidence(db, {
    userId,
    applicationId: app.id,
    kind: "confirmation_page",
    png: await driver.screenshot(),
    textExcerpt: waited.text.slice(0, 500),
    detail: { changed } as Json,
  });
  await setApplyStep(db, app.id, null, (changed.length ? `Submitted; you changed ${changed.join(", ")}.` : "Submitted by the apply runner.") + except);
  await transition(db, app.id, "submitted", "worker:apply", { mode: platform.mode, changed });
  await updatePlatform(db, userId, app.job.source, changed.length
    ? { clean_streak: 0, mode: "supervised" }
    : { clean_streak: platform.clean_streak + 1 });
  log(`${app.id}: submitted${changed.length ? ` (changed: ${changed.join(", ")})` : ""}`);
  return { result: "submitted", changed };
}

/** The user's platforms with whether auto mode is unlocked, for settings. */
export async function loadPlatforms(db: Db, userId: string) {
  const rows = await listPlatforms(db, userId);
  const byAts = new Map(rows.map((r) => [r.ats, r]));
  return APPLY_ATS.map((ats) => {
    const row = byAts.get(ats);
    const streak = row?.clean_streak ?? 0;
    const required = row?.required_streak ?? 3;
    return { ats, mode: row?.mode ?? "supervised", streak, required, canAuto: streak >= required };
  });
}

/** Switches a platform between supervised and auto (auto only once its streak is earned). */
export async function setPlatformMode(db: Db, userId: string, ats: string, mode: "supervised" | "auto"): Promise<void> {
  await getPlatform(db, userId, ats);
  await updatePlatform(db, userId, ats, { mode });
}

/** Sends an application the runner handed back to it again (after you fixed what stopped it, say). */
export async function retryApply(db: Db, userId: string, applicationId: string): Promise<void> {
  const app = await getApplication(db, userId, applicationId);
  if (!app) throw new ValidationError("That application is gone.");
  if (app.status !== "manual" || !canRetry(app.job.source, app.apply_note)) {
    throw new ValidationError("Only applications the apply runner handed back can go to it again.");
  }
  await setApplyStep(db, app.id, null, null);
  await transition(db, app.id, "approved", "user:retry_apply");
}

/** Whether "Try the runner again" applies: a runner site and a hand-back reason from the runner. */
export const canRetry = (source: string, applyNote: string | null) =>
  (APPLY_ATS as readonly string[]).includes(source) && applyNote != null;
