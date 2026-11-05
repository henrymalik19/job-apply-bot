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
  listUnfinished,
  getPlatform,
  listPlatforms,
  setApplyStep,
  updatePlatform,
  type ApplyJob,
  type Platform,
} from "./apply.repository";
import { buildFillPlan, changedFields, type FillStep } from "./fill-plan";
import { listFieldMappings, recordFieldOutcome, type FieldAnswer, type FieldMapping } from "./field-mapping";

/** ATSs the runner can fill (by field name). */
export const APPLY_ATS = ["greenhouse", "ashby", "lever"] as const;

/** A required field left empty after the prepared answers: what it asks and how it's answered. */
export type OpenField = {
  key: string;
  label: string;
  /** "agreement" is a lone checkbox (always yours); "combobox" a type-and-pick box. */
  kind: "text" | "textarea" | "select" | "multiselect" | "combobox" | "agreement";
  options: string[];
};

/** What the runner needs from a browser tab with an application form open. */
export interface FormDriver {
  /** Opens the form; "no_form" when the page has none (closed posting, login wall). */
  open(url: string): Promise<"ok" | "no_form">;
  /** Fills one field; false when the field or the option isn't on the page. */
  fill(step: FillStep, resumePath: string): Promise<boolean>;
  /** Each step's current value as shown on the page, by field name (unreadable fields left out). */
  values(steps: FillStep[]): Promise<Record<string, string>>;
  /** Whether the form has this field at all (for the run log: "not on this form" vs couldn't fill). */
  has?(fieldName: string): Promise<boolean>;
  /**
   * The visible required fields still empty, other than `known` (the fields the runner filled):
   * sections it didn't prepare for. Each key is what `fill` takes as a field name.
   */
  openFields?(known: string[]): Promise<OpenField[]>;
  /** A CAPTCHA or bot check is showing and needs a person. */
  challenge(): Promise<boolean>;
  /** The form asks for a code it emailed to the applicant before it accepts the submit. */
  emailCode(): Promise<boolean>;
  /** Types the emailed code and submits again; false when there's nowhere to type it. */
  enterEmailCode(code: string): Promise<boolean>;
  /** The page says the application was received; its text, or null. */
  confirmation(): Promise<string | null>;
  /**
   * The site refused the submission (Ashby's "flagged as possible spam"): what it said, or null.
   * The runner never tries to get past this; it hands the application back.
   */
  refused?(): Promise<string | null>;
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
  /**
   * Answers required fields the form still has empty, from your profile (Claude, on the server).
   * Without it they're left to you.
   */
  mapFields?: (input: { company: string; title: string; jobId?: string; fields: OpenField[] }) => Promise<FieldAnswer[]>;
  /**
   * Other values to try when a field won't take the prepared one ("Atlanta, GA" in a box that only
   * finds countries): Claude, on the server. Without it the field is left to you.
   */
  alternatives?: (input: { company: string; title: string; jobId?: string; label: string; kind: string; value: string }) => Promise<string[]>;
  /** How long to wait for the user to submit (default 30 minutes). */
  waitMs?: number;
  /** How often to look at the page while waiting (default 2 seconds). */
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** How long to wait before submitting again after the site refused a submission (default 2 minutes). */
  resubmitWaitMs?: number;
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
  if (job.source === "lever" && job.board_token) {
    return `https://jobs.lever.co/${encodeURIComponent(job.board_token)}/${encodeURIComponent(job.external_id)}/apply`;
  }
  if (job.source === "ashby" && job.board_token) {
    return `https://jobs.ashbyhq.com/${encodeURIComponent(job.board_token)}/${encodeURIComponent(job.external_id)}/application`;
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
/** How long to wait before submitting again after the site refused a submission (it suggests a few minutes). */
const RESUBMIT_WAIT_MS = 2 * 60_000;

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
    const refused = await driver.refused?.().catch(() => null);
    if (refused) return { refused, last };
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

/** A field filled outside the prepared answers: the step as filled, and the form's own label. */
type ExtraFill = { step: FillStep; label: string; value: string[] };

/** What learned values are kept under for a job: its board, else the company's name. */
const mappingCompany = (app: ApplyJob) => app.job.board_token ?? app.job.company_name;

/** Kinds whose value is typed or searched for, so another wording of it can be tried. */
const RETRYABLE = new Set<FillStep["kind"]>(["text", "location", "closest"]);

/**
 * Fills one prepared step. A required typed or searched field first gets what worked on this form
 * before (learned); if the prepared value doesn't take, Claude suggests other wordings to try
 * ("Atlanta, GA" → "United States" where the box only finds countries).
 *
 * @returns true when the prepared value took; a fill by another value (learned, or by AI and held
 * for you to check); or false when nothing took.
 */
async function fillStep(
  deps: ApplyDeps,
  app: ApplyJob,
  step: FillStep,
  resumePath: string,
  mappings: Map<string, FieldMapping>,
): Promise<boolean | { by: "ai" | "learned"; fill: ExtraFill }> {
  const typed = step.required && RETRYABLE.has(step.kind) && "value" in step && typeof step.value === "string" ? step.value : null;
  const withValue = (value: string, label = step.label) => ({ ...step, label, value }) as FillStep;
  const learned = typed != null ? mappings.get(step.fieldName) : undefined;
  if (typed != null && learned?.learned && learned.value[0] && learned.value[0] !== typed) {
    const alt = withValue(learned.value[0]);
    if (await deps.driver.fill(alt, resumePath)) return { by: "learned", fill: { step: alt, label: step.label, value: learned.value } };
  }
  if (await deps.driver.fill(step, resumePath)) return true;
  if (typed == null || !deps.alternatives) return false;
  const tries = await deps
    .alternatives({ company: app.job.company_name, title: app.job.title, jobId: app.job_id, label: step.label, kind: step.kind, value: typed })
    .catch((err) => {
      deps.log(`${app.id}: couldn't ask Claude for another value for "${step.label}": ${(err as Error).message}`);
      return [] as string[];
    });
  for (const value of tries) {
    // Marked in the run log, so the checklist shows what Claude filled.
    const alt = withValue(value, `${step.label} (filled by AI)`);
    if (await deps.driver.fill(alt, resumePath)) {
      deps.log(`${app.id}: "${step.label}" didn't take "${typed}"; filled by AI with "${value}"`);
      return { by: "ai", fill: { step: alt, label: step.label, value: [value] } };
    }
  }
  return false;
}

/** A filled value as a step for the driver: text, a choice, or a search to pick from. */
function stepFor(field: OpenField, value: string[], label: string): FillStep {
  const base = { fieldName: field.key, label, required: true };
  if (field.kind === "select" || field.kind === "multiselect") return { kind: "select", ...base, value };
  if (field.kind === "combobox") return { kind: "closest", ...base, value: value[0] };
  return { kind: "text", ...base, value: value[0] };
}

/**
 * Fills the required fields a form still has empty after the prepared answers: from what was learned
 * for this company, else from your profile by Claude. Writing, agreements and anything Claude isn't
 * sure of are left to you.
 *
 * @returns What was filled by AI (held for you to check), from learned mappings, and left to you.
 */
async function fillOpenFields(deps: ApplyDeps, app: ApplyJob, filled: FillStep[], resumePath: string, mappings: Map<string, FieldMapping>) {
  const out = { ai: [] as ExtraFill[], learned: [] as ExtraFill[], left: [] as string[], mappings, company: mappingCompany(app) };
  if (!deps.driver.openFields) return out;
  const open = await deps.driver.openFields(filled.map((s) => s.fieldName)).catch(() => []);
  if (open.length === 0) return out;

  const ask: OpenField[] = [];
  for (const field of open) {
    const learned = out.mappings.get(field.key);
    if (!learned?.learned || field.kind === "agreement") {
      ask.push(field);
      continue;
    }
    const step = stepFor(field, learned.value, field.label);
    if (await deps.driver.fill(step, resumePath)) out.learned.push({ step, label: field.label, value: learned.value });
    else out.left.push(field.label);
  }

  const answers = ask.length && deps.mapFields
    ? await deps.mapFields({ company: app.job.company_name, title: app.job.title, jobId: app.job_id, fields: ask }).catch((err) => {
        deps.log(`${app.id}: couldn't ask Claude about the open fields: ${(err as Error).message}`);
        return [] as FieldAnswer[];
      })
    : [];
  for (const field of ask) {
    const answer = answers.find((a) => a.key === field.key);
    if (!answer?.value) {
      out.left.push(field.label);
      continue;
    }
    // Marked in the run log, so the checklist shows what Claude filled.
    const step = stepFor(field, answer.value, `${field.label} (filled by AI)`);
    if (await deps.driver.fill(step, resumePath)) {
      out.ai.push({ step, label: field.label, value: answer.value });
      deps.log(`${app.id}: filled "${field.label}" by AI with ${answer.value.join(", ")} (${answer.reason})`);
    } else out.left.push(field.label);
  }
  return out;
}

async function run(deps: ApplyDeps, app: ApplyJob): Promise<ApplyOutcome> {
  const { db, userId, driver, log } = deps;
  const where = `${app.job.title} at ${app.job.company_name}`;
  const url = formUrl(app.job);
  if (!url) return handBack(deps, app, `The runner can't fill ${app.job.source} forms yet.`);

  const plan = buildFillPlan(app.questions);
  const known = new Set(plan.steps.map((s) => s.fieldName));
  // Extras go first (Country before the phone it formats) and aren't checked for your edits.
  // The resume goes first: some forms (Lever) read it and pre-fill other fields, which the rest then overwrite.
  const ordered = [...(deps.extraSteps ?? []).filter((s) => !known.has(s.fieldName)), ...plan.steps];
  const steps = [...ordered.filter((s) => s.kind === "resume"), ...ordered.filter((s) => s.kind !== "resume")];
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
  const mappings = await listFieldMappings(db, userId, app.job.source, mappingCompany(app)).catch(() => new Map<string, FieldMapping>());
  // Prepared fields filled with another value than prepared (learned, or by AI): checked and learned like extras.
  const recovered = { ai: [] as ExtraFill[], learned: [] as ExtraFill[] };
  for (const step of steps) {
    const filled = await fillStep(deps, app, step, resumePath, mappings);
    if (filled === true) continue;
    if (filled) {
      recovered[filled.by].push(filled.fill);
      continue;
    }
    if (step.required) missed.push(step.label);
    else if (known.has(step.fieldName)) skipped.push(step.label);
  }
  const except = skipped.length ? ` It couldn't fill ${skipped.map((m) => `"${m}"`).join(", ")}.` : "";
  // Steps only you can do (an assessment, a file to attach): everything else is filled, then it waits for you.
  const yours = plan.yours.length ? ` ${plan.yours.map((m) => `"${m}"`).join(", ")} ${plan.yours.length === 1 ? "is" : "are"} yours to do.` : "";
  // Required fields still empty (a section it didn't prepare for): learned, filled by AI, or left to you.
  const extra = await fillOpenFields(deps, app, steps, resumePath, mappings);
  extra.ai.unshift(...recovered.ai);
  extra.learned.unshift(...recovered.learned);
  // A prepared field filled with another value is checked as that value, not the prepared one.
  const other = new Set([...recovered.ai, ...recovered.learned].map((e) => e.step.fieldName));
  const prepared = plan.steps.filter((s) => !other.has(s.fieldName));
  const list = (labels: string[]) => labels.map((m) => `"${m}"`).join(", ");
  const byAi = extra.ai.length ? ` Filled by AI from your profile, check them: ${list(extra.ai.map((e) => e.label))}.` : "";
  // Required fields it tried and couldn't fill (a box that wouldn't take the value) are left to you too,
  // with the rest of the form filled, rather than handing the whole application back.
  const left = [...missed.filter((m) => !extra.left.includes(m)), ...extra.left];
  const leftForYou = left.length ? ` Left for you: ${list(left)}.` : "";
  // New AI answers and fields left to you always wait for you, even in auto mode; learned ones don't.
  const hold = extra.ai.length > 0 || left.length > 0;
  if (await driver.challenge()) return fail("The form shows a verification check. Finish it in the open Chrome window.");

  const answers = [...steps, ...extra.learned.map((e) => e.step), ...extra.ai.map((e) => e.step)].map((s) => ({ field: s.fieldName, label: s.label, value: s.kind === "resume" ? "resume" : s.kind === "decline" ? "declined" : s.value }));
  await addEvidence(db, {
    userId,
    applicationId: app.id,
    kind: "screenshot",
    png: await driver.screenshot(),
    detail: { answers, skipped, ai_filled: extra.ai.map((e) => ({ label: e.label, value: e.value })), left_for_you: left, resume_sha256: app.resume.sha256 } as Json,
  });

  if (platform.mode === "auto" && !yours && !hold) {
    await setApplyStep(db, app.id, "submitting", `Submitting the form for ${where}.`);
    await driver.submit();
  } else {
    await setApplyStep(db, app.id, "waiting_for_you", `Filled.${yours}${byAi}${leftForYou}${except} ${yours || left.length ? "Do that in the Chrome window, then click Submit." : "Check the Chrome window and click Submit."}`);
    await driver.focus();
  }

  const extraSteps = [...extra.learned, ...extra.ai].map((e) => e.step);
  const waitMs = yours || left.length ? YOUR_STEPS_WAIT_MS : undefined;
  let waited = await waitForConfirmation(deps, [...prepared, ...extraSteps], app, platform, waitMs);
  if ("closed" in waited) return fail("The Chrome tab was closed before submitting.");
  if ("refused" in waited) {
    // The site's own advice when it refuses one by mistake (Ashby's spam check): wait a few minutes and
    // submit again. Done once, with the same answers; a second refusal hands it back.
    const first = waited.refused;
    log(`${app.id}: the site refused the submission ("${first}"); filling it again to submit once more`);
    await setApplyStep(db, app.id, "submitting", `The site refused the submission ("${first}"). Submitting once more in a couple of minutes, as it suggests.`);
    await (deps.sleep ?? defaultSleep)(deps.resubmitWaitMs ?? RESUBMIT_WAIT_MS);
    if ((await driver.open(url)) === "no_form") return fail("After refusing the submission, the posting has no application form any more.");
    // The same answers again, with any text you changed in the form before submitting.
    const shown = waited.last ?? {};
    for (const step of [...steps.filter((x) => !other.has(x.fieldName)), ...extraSteps]) {
      const typed = step.kind === "text" && shown[step.fieldName] ? { ...step, value: shown[step.fieldName] } : step;
      if (!(await driver.fill(typed, resumePath)) && step.required) log(`${app.id}: couldn't fill "${step.label}" again`);
    }
    if (yours || left.length) {
      await setApplyStep(db, app.id, "waiting_for_you", `The site refused the first submission, so the form is filled again.${yours}${leftForYou} Do that in the Chrome window, then click Submit.`);
      await driver.focus();
    } else {
      await driver.submit();
    }
    waited = await waitForConfirmation(deps, [...prepared, ...extraSteps], app, platform, waitMs);
    if ("closed" in waited) return fail("The Chrome tab was closed before submitting.");
    if ("refused" in waited) return fail(`The site refused the submission twice, the second time a few minutes later: "${waited.refused}"`);
  }
  if ("timedOut" in waited) return { ...(await fail(`Nobody submitted the form within ${yours ? "an hour" : "30 minutes"}.`)), closeTab: true };

  const changed = platform.mode === "auto" ? [] : changedFields(prepared, waited.last);
  // What it learns: an AI or learned value you left as it was counts toward keeping it; one you changed is kept as you wrote it.
  for (const e of [...extra.learned, ...extra.ai]) {
    await recordFieldOutcome(
      db,
      userId,
      { ats: app.job.source, company: extra.company },
      { fieldName: e.step.fieldName, label: e.label, filled: e.value, final: waited.last[e.step.fieldName] },
      extra.mappings.get(e.step.fieldName),
    ).catch((err) => log(`${app.id}: couldn't record what was learned for "${e.label}": ${(err as Error).message}`));
  }
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

/** The note on an application the runner was stopped in the middle of. */
export const STOPPED_NOTE =
  "The apply runner was stopped before this was submitted. Retry it, or move it to Submitted if you submitted it yourself.";

/**
 * Hands back every application the runner was in the middle of: when it's stopped (Ctrl+C,
 * the terminal closed), and at start-up for any a crash left behind. They go to Runner stuck
 * rather than back to Approved, since you may have submitted the open form yourself.
 *
 * @returns How many were handed back.
 */
export async function handBackUnfinished(db: Db, userId: string): Promise<number> {
  const ids = await listUnfinished(db, userId);
  for (const id of ids) {
    await setApplyStep(db, id, null, STOPPED_NOTE);
    await transition(db, id, "manual", "worker:stopped", { reason: STOPPED_NOTE });
  }
  return ids.length;
}

/** Whether "Try the runner again" applies: a runner site and a hand-back reason from the runner. */
export const canRetry = (source: string, applyNote: string | null) =>
  (APPLY_ATS as readonly string[]).includes(source) && applyNote != null;
