// Prepare: for the best-scoring open jobs without an application, fetch the
// application form, check it for AI rules, answer each question from where
// its answer lives (profile, criteria, skill years, saved answers), have
// Claude match wordings it hasn't seen to the question catalog and draft
// open-ended answers, then store the application in the right lane: queued
// (ready to approve), needs_input (Needs you) or manual.
import type { Db, Json } from "@/server/db/types";
import type { StructuredCall } from "@/server/integrations/anthropic/claude";
import { FORM_ATS, fetchApplicationForm, type ApplicationForm, type FormQuestion } from "@/server/integrations/ats/forms";
import { check, unwrap, ValidationError } from "@/server/core/errors";
import { getApplication, setDraftedAnswer, type AppStatus } from "@/server/modules/applications/applications.service";
import { transition, updateQuestion } from "@/server/modules/applications/applications.repository";
import type { Row as DbRow } from "@/server/db/types";
import { getMatchCriteria, type MatchCriteria } from "@/server/modules/criteria/criteria.service";
import { lessonsFor } from "@/server/modules/lessons/lessons.service";
import { notify } from "@/server/modules/notifications/in-app";
import { resolvePlace } from "@/server/modules/criteria/places";
import { getProfile, profileLines, resolveSkillId, type ProfileData } from "@/server/modules/profile/profile.service";
import {
  ensureQuestion,
  insertAlias,
  listAliases,
  listAnswers,
  listQuestions,
  type Question,
  type QuestionAlias,
} from "@/server/modules/questions/questions.service";
import { failInterruptedRuns, finishRun, startRun } from "@/server/modules/runs/runs.service";
import { getUserSetting } from "@/server/modules/settings/settings.service";
import { saveApplicationResume, tailorResume } from "@/server/modules/resumes/resumes.service";
import { getMonthlySpend, recordUsage } from "@/server/modules/usage/usage.service";
import { findAiRestriction, postingFlags, visibleText, type ApplicationFlag } from "./ai-rules";
import {
  criteriaValue,
  declineOption,
  normalizeQuestion,
  profileValue,
  shapeAnswer,
  skillYearsValue,
  type AnswerValue,
} from "./answers";
import {
  buildClassifyPrompt,
  buildDraftPrompt,
  buildPickPrompt,
  classifyOutputSchema,
  draftOutputSchema,
  pickOutputSchema,
  type ClassifiedQuestion,
  type PromptPosting,
  type PromptQuestion,
} from "./prepare-prompts";
import {
  asJson,
  countApplicationsSince,
  deleteApplication,
  getJobPosting,
  listNoFormApplications,
  noFormError,
  insertApplication,
  setPrepareError,
  listPrepareCandidates,
  type NewQuestion,
  type PrepareCandidate,
} from "./prepare.repository";

const WORKER = "prepare";
const INTERRUPTED_AFTER_MS = 60 * 60 * 1000;
/**
 * The version of the answering rules (how questions are sorted: the classify prompt, the catalog questions
 * and how they're answered). Bump it when they change: applications sorted with an older version have their
 * open questions sorted again, once (see {@link recheckOpenQuestions}).
 *
 * 1: consents and "worked here before" as saved answers, the clearance field, follow-up questions.
 */
export const RULES_VERSION = 1;

/** A classifier pick below this confidence isn't saved as an alias and goes to the owner. */
export const ALIAS_CONFIDENCE = 0.8;

/** Dependencies of a prepare run; tests inject fakes. */
export type PrepareDeps = {
  /** Service-role client. */
  db: Db;
  /** Whose applications to prepare. */
  userId: string;
  /** Cheap structured call (Haiku) for classifying questions. */
  call: StructuredCall;
  /** Structured call for drafting open-ended answers (Sonnet). */
  draftCall: StructuredCall;
  /** Fetches a posting's form; defaults to the public ATS endpoints. */
  fetchForm?: (ats: string, boardToken: string, externalId: string) => Promise<ApplicationForm | null>;
  now?: () => Date;
  /** Only consider these jobs (tests). */
  onlyJobIds?: string[];
  /** Prepare at most this many (below the daily cap), e.g. for a trial run. */
  limit?: number;
  log?: (line: string) => void;
};

/** What a prepare run did. */
export type PrepareCounts = {
  candidates: number;
  queued: number;
  needs_input: number;
  manual: number;
  failed: number;
  /** Left for later: over the daily cap or the monthly LLM budget. */
  deferred: number;
  /** Resumes tailored, and resumes that fell back to the untailored version (fact guard). */
  tailored: number;
  untailored: number;
  cost_usd: number;
  /** "Can't be filled" applications started over because their form can be read now. */
  restarted?: number;
  /** Applications whose open questions were sorted again after the answering rules changed. */
  rechecked?: number;
};

/**
 * Starts over the applications prepare couldn't read a form for, on sites it reads now (one
 * prepared before Lever was supported, say), when their form is there now. A closed posting
 * still has none, so it stays as it is.
 *
 * @returns How many were started over (prepared again in this run).
 */
async function restartNoFormApplications(deps: PrepareDeps, fetchForm: NonNullable<PrepareDeps["fetchForm"]>): Promise<number> {
  const only = deps.onlyJobIds && new Set(deps.onlyJobIds);
  const stale = (await listNoFormApplications(deps.db, deps.userId, FORM_ATS)).filter((a) => !only || only.has(a.job.id));
  let restarted = 0;
  for (const app of stale) {
    const form = await fetchForm(app.job.source, app.job.board_token, app.job.external_id).catch(() => null);
    if (!form) continue;
    // An email linked to it keeps it (that link has no cascade); it stays for you to apply by hand.
    const gone = await deleteApplication(deps.db, app.id).then(() => true, () => false);
    if (gone) restarted++;
  }
  return restarted;
}

// Standard fields recognized by their form field name → catalog question key.
const STANDARD_FIELDS: Record<string, string> = {
  first_name: "first_name",
  last_name: "last_name",
  preferred_name: "preferred_name",
  email: "email",
  phone: "phone",
  _systemfield_name: "full_name",
  _systemfield_email: "email",
  _systemfield_location: "current_location",
  // Lever's standard fields.
  name: "full_name",
  location: "current_location",
  org: "current_company_name",
  "urls[LinkedIn]": "linkedin_url",
  "urls[GitHub]": "github_url",
  "urls[Portfolio]": "website_url",
};

const isResume = (q: FormQuestion) => q.fieldType === "file" && /resume|cv/i.test(`${q.fieldName} ${q.label}`);

/** Context shared by every application in a run. */
type RunContext = {
  questions: Map<string, Question>;
  questionsById: Map<string, Question>;
  aliases: Map<string, QuestionAlias>;
  answers: Map<string, Json>;
  profile: ProfileData;
  criteria: MatchCriteria;
  /** The profile as prompt lines. */
  facts: { category: string; fact: string }[];
  /** The posting's country (ISO code), set per job. */
  country: string;
  /** The posting's company, set per job. */
  company?: string;
  now: Date;
  answerLessons: { rule: string; scope: string; active: boolean }[];
  tailoringLessons: { rule: string; scope: string; active: boolean }[];
  spend: { cost: number };
};

/** How a wording maps to its catalog question. */
type Mapping = { inverted: boolean; confirmed: boolean; skillId: string | null };

/** One question on its way to an `application_questions` row. */
type Draft = NewQuestion & { _index: number };

function baseRow(q: FormQuestion, index: number): Draft {
  return {
    _index: index,
    question: q.label,
    field_name: q.fieldName,
    field_type: q.fieldType,
    description: q.description,
    options: asJson(q.options),
    required: q.required,
    sort_order: index,
    bucket: "needs_user",
    // Every row carries every key: a bulk insert sends null for keys missing
    // from some rows, which would skip the column defaults.
    answer: null,
    answer_value: null,
    answer_source: null,
    question_id: null,
    needs_check: false,
    reason: null,
  };
}

/** A catalog question's value, read from where it lives; null when not stated there. */
function questionValue(question: Question, mapping: Mapping, ctx: RunContext): AnswerValue | null {
  switch (question.answer_source) {
    case "profile":
      return profileValue(question.key, ctx.profile, { country: ctx.country, now: ctx.now, company: ctx.company });
    case "criteria":
      return criteriaValue(question.key, ctx.criteria);
    case "skill_years":
      return mapping.skillId ? skillYearsValue(mapping.skillId, ctx.profile, ctx.now) : null;
    case "answer":
      return (ctx.answers.get(question.id) as AnswerValue | undefined) ?? null;
    default:
      return null;
  }
}

const WHERE: Record<string, string> = {
  profile: "your profile doesn't say",
  criteria: "your search criteria don't say",
  skill_years: "your profile has no years for this skill:",
  answer: "no saved answer for",
};

/** Rows whose known answer didn't match the form's options, with that answer: Claude may pick the option. */
const misfits = new WeakMap<Draft, { label: string; value: AnswerValue }>();

/** A known answer as text for the pick prompt. */
const valueText = (v: AnswerValue): string =>
  typeof v === "boolean" ? (v ? "Yes" : "No") : typeof v === "object" ? `${v.min} to ${v.max}` : String(v);

/** Fills a row from a catalog question: auto when its value fits the form, otherwise Needs you. */
function answerFromQuestion(row: Draft, q: FormQuestion, question: Question, ctx: RunContext, mapping: Mapping): Partial<Draft> | "draft" {
  const linked = { question_id: question.id };
  if (question.answer_source === "drafted") return "draft";
  if (question.answer_source === "ask") return { ...linked, bucket: "needs_user", reason: `"${question.label}" is always answered by you` };
  const value = questionValue(question, mapping, ctx);
  if (value == null) return { ...linked, bucket: "needs_user", reason: `${WHERE[question.answer_source]} "${question.label}"` };
  const shaped = shapeAnswer(q, value, mapping.inverted);
  if (!shaped) {
    if (q.options.length > 0 && !mapping.inverted) misfits.set(row, { label: question.label, value });
    return { ...linked, bucket: "needs_user", reason: `your answer for "${question.label}" doesn't fit this question's options` };
  }
  return {
    ...linked,
    bucket: "auto",
    answer: shaped.answer,
    answer_value: asJson(shaped.value),
    answer_source: question.answer_source,
    needs_check: !mapping.confirmed,
  };
}

/** Calls a structured prompt, retrying once on missing or invalid output. Records usage. */
async function callWithRetry<T>(
  deps: Pick<PrepareDeps, "db" | "userId">,
  call: StructuredCall,
  purpose: string,
  jobId: string,
  request: Parameters<StructuredCall>[0] & { schema: import("zod").ZodType<T> },
  spend: { cost: number },
): Promise<T | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await call<T>(request);
    spend.cost += await recordUsage(deps.db, deps.userId, { purpose, model: res.model, usage: res.usage, jobId });
    if (res.output != null) return res.output;
  }
  return null;
}

/**
 * Prepares one job: returns the application's status, flags and question rows.
 * Exported for tests; {@link runPrepare} is the entry point.
 */
export async function prepareJob(
  deps: PrepareDeps,
  candidate: PrepareCandidate,
  runCtx: RunContext,
): Promise<{
  status: AppStatus;
  flags: ApplicationFlag[];
  questions: NewQuestion[];
  /** The posting text the resume is tailored to; absent when preparing failed. */
  posting?: PromptPosting;
  error?: string;
}> {
  const { job } = candidate;
  // Work-authorization questions are about the posting's country; US unless its location names exactly one other.
  const countries = resolvePlace(job.location ?? "").countries;
  const ctx: RunContext = { ...runCtx, country: countries.size === 1 ? [...countries][0] : "US", company: job.company_name };
  const fetchForm = deps.fetchForm ?? ((ats, token, id) => fetchApplicationForm(ats, token, id));
  const form = await fetchForm(job.source, job.board_token, job.external_id);
  if (!form) {
    // Still tailor a resume: a manual application needs one too.
    const posting = { title: job.title, company_name: job.company_name, text: job.description_md ?? "" };
    return { status: "manual", flags: [], questions: [], posting, error: noFormError(job.source) };
  }

  const flags = postingFlags(form.descriptionHtml);
  const postingRestricted = flags.some((f) => f.kind === "ai_restriction");
  const isRestricted = (q: FormQuestion) => postingRestricted || flags.some((f) => f.kind === "ai_restriction" && f.where === q.fieldName);
  const posting: PromptPosting = {
    title: job.title,
    company_name: job.company_name,
    text: visibleText(form.descriptionHtml) || job.description_md || "",
  };

  const rows: Draft[] = [];
  const pairs: { row: Draft; q: FormQuestion }[] = [];
  const unknown: { row: Draft; q: FormQuestion }[] = [];
  const toDraft: { row: Draft; q: FormQuestion }[] = [];
  const fill = (row: Draft, q: FormQuestion, filled: Partial<Draft> | "draft") => {
    if (filled !== "draft") Object.assign(row, filled);
    else if (isRestricted(q)) Object.assign(row, { bucket: "needs_user", reason: "the employer restricts AI-written answers" });
    else toDraft.push({ row, q });
  };

  for (const [index, q] of form.questions.entries()) {
    if (q.fieldType === "hidden") continue;
    const row = baseRow(q, index);
    rows.push(row);
    pairs.push({ row, q });
    const restriction = findAiRestriction(`${q.label}\n${q.description ?? ""}`);
    if (restriction) flags.push({ kind: "ai_restriction", excerpt: restriction, where: q.fieldName });

    if (isResume(q)) {
      Object.assign(row, { bucket: "auto", answer: "Tailored resume (PDF)", answer_source: "profile" });
    } else if (q.fieldType === "file") {
      // A required file other than the resume is attached by you in the Chrome window, once the runner fills the rest.
      Object.assign(row, q.required
        ? { bucket: "cannot_automate", reason: "a file to attach in the Chrome window" }
        : { bucket: "auto", reason: "optional; not sent" });
    } else if (q.group === "eeo") {
      const decline = declineOption(q);
      Object.assign(row, decline
        ? { bucket: "auto", answer: decline.answer, answer_value: asJson(decline.value), answer_source: "rule" }
        : { bucket: q.required ? "needs_user" : "auto", reason: q.required ? "voluntary question without a decline option" : "optional; left blank" });
    } else {
      const standard = STANDARD_FIELDS[q.fieldName];
      const alias = standard ? undefined : ctx.aliases.get(normalizeQuestion(q.label));
      const question = standard ? ctx.questions.get(standard) : alias ? ctx.questionsById.get(alias.question_id) : undefined;
      if (question) {
        fill(row, q, answerFromQuestion(row, q, question, ctx, {
          inverted: alias?.polarity === "inverted",
          confirmed: Boolean(standard) || Boolean(alias?.confirmed),
          skillId: alias?.skill_id ?? null,
        }));
      } else {
        unknown.push({ row, q });
      }
    }
  }

  if (unknown.length > 0) {
    const promptQuestions: PromptQuestion[] = unknown.map(({ row, q }) => ({
      index: row._index, label: q.label, description: q.description, fieldType: q.fieldType,
      options: q.options.map((o) => o.label), required: q.required,
    }));
    const prompt = buildClassifyPrompt({
      catalog: [...ctx.questions.values()].map((t) => ({ key: t.key, label: t.label, answer_type: t.answer_type })),
      facts: ctx.facts,
      posting,
      questions: promptQuestions,
    });
    const output = await callWithRetry(deps, deps.call, "classify", job.id, { ...prompt, schema: classifyOutputSchema, maxTokens: 6000 }, ctx.spend);
    if (!output) return { status: "failed", flags, questions: [], error: "question classification failed twice" };
    const byIndex = new Map(output.questions.map((c) => [c.index, c]));
    for (const item of unknown) {
      const c = byIndex.get(item.row._index);
      fill(item.row, item.q, c ? await applyClassification(deps.db, item, c, ctx) : { bucket: "needs_user", reason: "not classified" });
    }
  }

  if (toDraft.length > 0) {
    const draftPrompt = buildDraftPrompt({
      facts: ctx.facts,
      lessons: ctx.answerLessons,
      posting,
      questions: toDraft.map(({ row, q }) => {
        // The question before it on the form, for a follow-up ("If yes, please explain").
        const before = rows[rows.indexOf(row) - 1];
        return {
          index: row._index, label: q.label, description: q.description, fieldType: q.fieldType, options: [], required: q.required,
          ...(before ? { follows: { label: before.question, answer: before.answer ?? null } } : {}),
        };
      }),
    });
    const drafts = await callWithRetry(deps, deps.draftCall, "draft", job.id, { ...draftPrompt, schema: draftOutputSchema, maxTokens: 8000, effort: "medium" }, ctx.spend);
    const byDraft = new Map((drafts?.answers ?? []).map((a) => [a.index, a.answer.trim()]));
    for (const { row } of toDraft) {
      const answer = byDraft.get(row._index);
      Object.assign(row, answer
        ? { bucket: "drafted", answer, answer_value: asJson(answer), answer_source: "drafted", needs_check: true }
        : { bucket: "needs_user", reason: "drafting failed" });
    }
  }

  // Known answers the rules couldn't match to an option ("Atlanta, GA" for a list of countries): Claude picks
  // the option they mean, or leaves it to you. Its picks are marked to double-check.
  const toPick = pairs.filter(({ row }) => row.bucket === "needs_user" && misfits.has(row));
  if (toPick.length > 0) {
    const prompt = buildPickPrompt({
      facts: ctx.facts,
      questions: toPick.map(({ row, q }) => {
        const known = misfits.get(row)!;
        return { index: row._index, label: q.label, options: q.options.map((o) => o.label), known: `${known.label}: ${valueText(known.value)}` };
      }),
    });
    const out = await callWithRetry(deps, deps.call, "pick_option", job.id, { ...prompt, schema: pickOutputSchema, maxTokens: 1500 }, ctx.spend);
    const byIndex = new Map((out?.picks ?? []).map((p) => [p.index, p]));
    for (const { row, q } of toPick) {
      const pick = byIndex.get(row._index);
      const option = pick?.option == null ? undefined : q.options.find((o) => o.label === pick.option);
      if (!option) continue;
      Object.assign(row, {
        bucket: "auto",
        answer: option.label,
        answer_value: asJson(q.fieldType === "multiselect" ? [option.value] : option.value),
        answer_source: "profile",
        needs_check: true,
        reason: `picked by AI from your ${misfits.get(row)!.label.toLowerCase()}: ${pick!.reason}`.slice(0, 500),
      });
    }
  }

  const questions = rows.map(({ _index: _i, ...r }) => r);
  const blocking = questions.filter((q) => q.required);
  // Steps only you can do (cannot_automate) don't hold it back: the runner fills the rest and leaves those to you.
  const status: AppStatus = blocking.some((q) => q.bucket === "needs_user") ? "needs_input" : "queued";
  return { status, flags, questions, posting };
}

async function ensureQuestionCached(
  db: Db,
  ctx: RunContext,
  question: { key: string; label: string; category: string; answer_type: string },
): Promise<Question> {
  const existing = ctx.questions.get(question.key);
  if (existing) return existing;
  const created = await ensureQuestion(db, question as Parameters<typeof ensureQuestion>[1]);
  ctx.questions.set(created.key, created);
  ctx.questionsById.set(created.id, created);
  return created;
}

/** Turns one classification into a filled row, or "draft" for open-ended questions. */
async function applyClassification(
  db: Db,
  { row, q }: { row: Draft; q: FormQuestion },
  c: ClassifiedQuestion,
  ctx: RunContext,
): Promise<Partial<Draft> | "draft"> {
  switch (c.kind) {
    case "open_ended":
      return "draft";
    case "attestation":
      return { bucket: "needs_user", reason: "attestations are always answered by you" };
    case "cannot_automate":
      // A question with options to pick can always be answered, by you if not from the profile.
      return q.options.length > 0
        ? { bucket: "needs_user", reason: c.reason }
        : { bucket: "cannot_automate", reason: c.reason };
    case "qualification": {
      const supported = c.qualification_answer === "yes" && c.supporting_facts.some((n) => n >= 1 && n <= ctx.facts.length);
      const shaped = supported ? shapeAnswer(q, true) : null;
      return shaped
        ? { bucket: "auto", answer: shaped.answer, answer_value: asJson(shaped.value), answer_source: "profile", needs_check: true, reason: c.reason }
        : { bucket: "needs_user", reason: c.qualification_answer === "no" ? `your profile suggests no: ${c.reason}` : `your profile doesn't settle it: ${c.reason}` };
    }
    case "catalog": {
      const known = c.question_key ? ctx.questions.get(c.question_key) : undefined;
      const question = known ?? (c.new_question ? await ensureQuestionCached(db, ctx, c.new_question) : undefined);
      if (!question) return { bucket: "needs_user", reason: c.reason };
      const skillId = question.answer_source === "skill_years" && c.skill ? await resolveSkillId(db, c.skill) : null;
      if (c.confidence < ALIAS_CONFIDENCE) {
        return { question_id: question.id, bucket: "needs_user", reason: `not sure this is "${question.label}"` };
      }
      const alias = {
        normalized_text: normalizeQuestion(q.label),
        question_id: question.id,
        polarity: c.polarity,
        skill_id: skillId,
        confidence: c.confidence,
        confirmed: false,
      };
      await insertAlias(db, alias);
      const stamp = new Date().toISOString();
      ctx.aliases.set(alias.normalized_text, { ...alias, created_at: stamp, updated_at: stamp });
      return answerFromQuestion(row, q, question, ctx, { inverted: c.polarity === "inverted", confirmed: false, skillId });
    }
  }
}

/** Everything answering a user's questions needs: the catalog, wordings, saved answers, profile, criteria, lessons. */
async function loadRunContext(db: Db, userId: string, now: Date): Promise<RunContext> {
  const [criteria, profile, answerLessons, tailoringLessons, questions, aliases, answers] = await Promise.all([
    getMatchCriteria(db, userId),
    getProfile(db, userId),
    lessonsFor(db, userId, "answers"),
    lessonsFor(db, userId, "tailoring"),
    listQuestions(db),
    listAliases(db),
    listAnswers(db, userId),
  ]);
  return {
    questions: new Map(questions.map((q) => [q.key, q])),
    questionsById: new Map(questions.map((q) => [q.id, q])),
    aliases,
    answers,
    profile,
    criteria,
    facts: profileLines(profile, now),
    country: "US",
    now,
    answerLessons: answerLessons.map((l) => ({ rule: l.rule, scope: l.scope, active: l.active })),
    tailoringLessons: tailoringLessons.map((l) => ({ rule: l.rule, scope: l.scope, active: l.active })),
    spend: { cost: 0 },
  };
}

function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Runs prepare once for a user: up to their daily cap (`user_settings.daily_cap`,
 * default 20) of their best-scoring open jobs without an application, stopping early at the
 * monthly LLM cap. Each job's failure is recorded on its application and
 * doesn't stop the run.
 */
export async function runPrepare(deps: PrepareDeps): Promise<{ runId: string; counts: PrepareCounts }> {
  const { db, userId, now = () => new Date(), log = () => {} } = deps;
  await failInterruptedRuns(db, WORKER, new Date(now().getTime() - INTERRUPTED_AFTER_MS));
  const runId = await startRun(db, WORKER, null, userId);
  const counts: PrepareCounts = { candidates: 0, queued: 0, needs_input: 0, manual: 0, failed: 0, deferred: 0, tailored: 0, untailored: 0, cost_usd: 0 };

  try {
    const [ctx, budget, cap, today] = await Promise.all([
      loadRunContext(db, userId, now()),
      getMonthlySpend(db, userId, now()),
      getUserSetting(db, userId, "daily_cap"),
      countApplicationsSince(db, userId, utcDayStart(now())),
    ]);
    const fetchForm = deps.fetchForm ?? ((ats: string, token: string, id: string) => fetchApplicationForm(ats, token, id));
    counts.restarted = await restartNoFormApplications(deps, fetchForm);
    if (counts.restarted) log(`started over ${counts.restarted} application(s) whose form can be read now`);
    const room = Math.min(deps.limit ?? Infinity, Math.max(0, Number(cap ?? 20) - today));
    let candidates = await listPrepareCandidates(db, userId, ctx.criteria.threshold, deps.onlyJobIds ? 500 : room + 50);
    if (deps.onlyJobIds) {
      const only = new Set(deps.onlyJobIds);
      candidates = candidates.filter((c) => only.has(c.job.id));
    }
    counts.candidates = candidates.length;

    let made = 0;
    for (const candidate of candidates) {
      if (made >= room || budget.spent + ctx.spend.cost >= budget.cap) {
        counts.deferred++;
        continue;
      }
      let result: Awaited<ReturnType<typeof prepareJob>>;
      try {
        result = await prepareJob(deps, candidate, ctx);
      } catch (err) {
        result = { status: "failed", flags: [], questions: [], error: err instanceof Error ? err.message : String(err) };
      }
      const applicationId = await insertApplication(
        db,
        {
          user_id: userId,
          job_id: candidate.job.id,
          match_id: candidate.matchId,
          status: result.status,
          flags: result.flags as NonNullable<Json>,
          apply_method: "self",
          prepared_at: now().toISOString(),
          prepare_error: result.error?.slice(0, 500) ?? null,
          rules_version: RULES_VERSION,
        },
        result.questions,
      );
      made++;
      if (result.posting) {
        try {
          const resume = await tailorResume({
            db, userId, call: deps.draftCall, data: ctx.profile, lessons: ctx.tailoringLessons, posting: result.posting,
            jobId: candidate.job.id, now: now(), spend: ctx.spend,
          });
          await saveApplicationResume(db, userId, applicationId, resume, `${candidate.job.title} at ${candidate.job.company_name}`);
          counts[resume.kind === "tailored" ? "tailored" : "untailored"]++;
          if (resume.problems.length) log(`${candidate.job.id}: untailored resume (${resume.problems.join("; ")})`);
        } catch (err) {
          const message = `resume: ${err instanceof Error ? err.message : String(err)}`;
          await setPrepareError(db, applicationId, [result.error, message].filter(Boolean).join("; "));
          log(`${candidate.job.id}: ${message}`);
        }
      }
      counts[result.status === "queued" || result.status === "needs_input" || result.status === "manual" ? result.status : "failed"]++;
      if (result.error) log(`${candidate.job.id}: ${result.error}`);
    }
    // Applications prepared under older answering rules: their open questions sorted again, once.
    const rechecked = await recheckOpenQuestions({ db, userId, call: deps.call, now, log }, { onlyOutdated: true }).catch((err) => {
      log(`recheck failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    });
    if (rechecked) {
      counts.rechecked = rechecked.applications;
      ctx.spend.cost += rechecked.cost_usd;
    }
    counts.cost_usd = Math.round(ctx.spend.cost * 1e6) / 1e6;
    // One notification per run, not one per application.
    const ready = [
      counts.queued ? `${counts.queued} ready to review` : "",
      counts.needs_input ? `${counts.needs_input} ${counts.needs_input === 1 ? "needs" : "need"} your answers` : "",
    ].filter(Boolean);
    if (ready.length) await notify(db, userId, { kind: "prepared", title: `New applications: ${ready.join(", ")}`, href: "/app/todo" });
    await finishRun(db, runId, { ok: true, counts });
    return { runId, counts };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishRun(db, runId, { ok: false, counts, error: message }).catch(() => {});
    throw err;
  }
}

/**
 * Redrafts one open-ended answer with Claude, from the user's profile, answer
 * rules and the posting, plus optional guidance for this answer ("shorter",
 * "mention the payments work"). The user asked for it, so it runs even where the
 * employer restricts AI use (prepare itself never auto-drafts there).
 *
 * @returns The new draft (also saved on the question, marked to check).
 * @throws {@link ValidationError} when it can't be redrafted or drafting fails.
 */
export async function redraftAnswer(deps: {
  db: Db;
  userId: string;
  call: StructuredCall;
  applicationId: string;
  questionId: string;
  guidance?: string;
  now?: Date;
}): Promise<string> {
  const { db, userId, now = new Date() } = deps;
  const app = await getApplication(db, userId, deps.applicationId);
  const q = app?.questions.find((x) => x.id === deps.questionId);
  if (!app || !q) throw new ValidationError("That question is gone; reload the page.");
  const budget = await getMonthlySpend(db, userId, now);
  if (budget.spent >= budget.cap) throw new ValidationError("This month's Claude budget is used up.");

  const [profile, lessons, job] = await Promise.all([getProfile(db, userId), lessonsFor(db, userId, "answers"), getJobPosting(db, app.job.id)]);
  const guidance = deps.guidance?.trim().slice(0, 300);
  // The question before it on the form, for a follow-up ("If yes, please explain").
  const before = [...app.questions].filter((x) => x.sort_order < q.sort_order).sort((a, b) => b.sort_order - a.sort_order)[0];
  const prompt = buildDraftPrompt({
    facts: profileLines(profile, now),
    lessons: [
      ...lessons.map((l) => ({ rule: l.rule, scope: l.scope, active: l.active })),
      ...(guidance ? [{ rule: `For this answer: ${guidance}`, scope: "answers", active: true }] : []),
    ],
    posting: { title: app.job.title, company_name: app.job.company_name, text: job?.description_md ?? "" },
    questions: [{
      index: 1, label: q.question, description: q.description, fieldType: q.field_type ?? "textarea", options: [], required: q.required,
      ...(before ? { follows: { label: before.question, answer: before.answer } } : {}),
    }],
  });
  const spend = { cost: 0 };
  const output = await callWithRetry({ db, userId }, deps.call, "redraft", app.job.id, { ...prompt, schema: draftOutputSchema, maxTokens: 2000, effort: "medium" }, spend);
  const answer = output?.answers.find((a) => a.index === 1)?.answer.trim();
  if (!answer) throw new ValidationError("Drafting failed; try again or write it yourself.");
  await setDraftedAnswer(db, userId, app.id, q.id, answer);
  return answer;
}

/** What a recheck of open questions did. */
export type RecheckCounts = {
  /** Applications with open questions looked at. */
  applications: number;
  /** Questions now answered (from your profile, saved answers or search criteria). */
  answered: number;
  /** Steps that were "only you can do" and are now questions you can answer in the app. */
  answerable: number;
  /** Applications with nothing required left, moved to Ready to review. */
  movedToReview: number;
  /** Answers from your profile, criteria or saved answers that changed since, brought up to date. */
  refreshed: number;
  cost_usd: number;
};

/** What a recheck changed on one application, in a few words; null when nothing did. */
function recheckNote(did: { answered: number; answerable: number; moved: boolean }): string | null {
  const parts = [
    did.answered ? `${did.answered} ${did.answered === 1 ? "answer" : "answers"} filled` : "",
    did.answerable ? `${did.answerable} ${did.answerable === 1 ? "step" : "steps"} you can now answer here` : "",
    did.moved ? "moved to Ready to review" : "",
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** A question still waiting on you: unanswered, and something you could type or pick (not a file). */
const isOpen = (q: { answer: string | null; bucket: string; field_type: string | null }) =>
  q.answer == null && (q.bucket === "needs_user" || q.bucket === "cannot_automate") && q.field_type !== "file" && q.field_type !== "hidden";

/** Where an answer came from, when it follows your profile, criteria or saved answers (not one you typed). */
const FOLLOWS_YOU = new Set(["profile", "criteria", "skill_years", "answer"]);

/** An answer taken from your profile, criteria or saved answers, which a change there should update. */
const isFromYou = (q: { answer: string | null; answer_source: string | null; question_id: string | null }) =>
  q.answer != null && q.question_id != null && FOLLOWS_YOU.has(q.answer_source ?? "");

/**
 * Sorts the open questions of your waiting applications (Needs you and Ready to review) again with
 * today's rules, catalog, saved answers and profile: what was prepared before a change (a consent
 * becoming a saved answer, "worked here before" from your jobs) gets answered, or becomes a question
 * you can answer in the app. Answers taken from your profile, search criteria or saved answers are
 * brought up to date with them (one you typed yourself is left alone). Wordings already known cost
 * nothing; the rest is one Claude call per application. Nothing is drafted. Approved applications the
 * runner hasn't started are included, since it fills from these answers. Without `call` (after a
 * profile save), it only does what needs no Claude.
 */
export async function recheckOpenQuestions(
  deps: Pick<PrepareDeps, "db" | "userId" | "now" | "log"> & { call?: StructuredCall },
  opts: { applicationIds?: string[]; concurrency?: number; onlyOutdated?: boolean } = {},
): Promise<RecheckCounts> {
  const { db, userId, now = () => new Date(), log = () => {} } = deps;
  const counts: RecheckCounts = { applications: 0, answered: 0, answerable: 0, movedToReview: 0, refreshed: 0, cost_usd: 0 };
  const [ctx, budget] = await Promise.all([loadRunContext(db, userId, now()), getMonthlySpend(db, userId, now())]);
  let query = db
    .from("applications")
    .select("id, status, apply_step, job_id, jobs!inner(title, company_name, location, description_md), application_questions(*)")
    .eq("user_id", userId)
    .in("status", ["needs_input", "queued", "approved"]);
  if (opts.applicationIds) query = query.in("id", opts.applicationIds);
  if (opts.onlyOutdated) query = query.lt("rules_version", RULES_VERSION);
  const { data, error } = await query;
  if (error) throw new Error(`list applications to recheck: ${error.message}`);
  type ApplicationQuestionRow = DbRow<"application_questions">;
  type Row = { id: string; status: AppStatus; apply_step: string | null; job_id: string; jobs: { title: string; company_name: string; location: string | null; description_md: string | null }; application_questions: ApplicationQuestionRow[] };
  // An approved one the runner is filling right now is left alone.
  const all = ((data ?? []) as unknown as Row[]).filter((a) => !(a.status === "approved" && a.apply_step));
  const apps = all.filter((a) => a.application_questions.some((q) => isOpen(q) || isFromYou(q)));
  counts.applications = apps.length;
  // Sorting with Claude brings an application up to the current rules; one with nothing to sort already is.
  const current = { rules_version: RULES_VERSION, rechecked_at: now().toISOString() };
  const settled = all.filter((a) => !apps.includes(a)).map((a) => a.id);
  if (deps.call && settled.length) check(await db.from("applications").update(current).in("id", settled), "mark applications current");

  const recheck = async (app: Row) => {
    const did = { answered: 0, answerable: 0, refreshed: 0, moved: false, sorted: true };
    const countries = resolvePlace(app.jobs.location ?? "").countries;
    const actx: RunContext = { ...ctx, country: countries.size === 1 ? [...countries][0] : "US", company: app.jobs.company_name };
    const asForm = (r: ApplicationQuestionRow): FormQuestion => ({
      fieldName: r.field_name ?? r.id,
      label: r.question,
      description: r.description,
      required: r.required,
      fieldType: (r.field_type ?? "text") as FormQuestion["fieldType"],
      options: (r.options as FormQuestion["options"] | null) ?? [],
      group: "application",
    });

    // Answers from your profile, criteria or saved answers: brought up to date when those changed.
    for (const r of app.application_questions.filter(isFromYou)) {
      const question = ctx.questionsById.get(r.question_id!);
      if (!question) continue;
      const q = asForm(r);
      const alias = ctx.aliases.get(normalizeQuestion(q.label));
      const mapped = alias?.question_id === question.id ? alias : undefined;
      const fresh = answerFromQuestion({ ...baseRow(q, r.sort_order), _index: r.sort_order }, q, question, actx, {
        inverted: mapped?.polarity === "inverted",
        confirmed: true,
        skillId: mapped?.skill_id ?? null,
      });
      if (fresh === "draft" || fresh.bucket !== "auto" || fresh.answer == null || fresh.answer === r.answer) continue;
      await updateQuestion(db, r.id, { answer: fresh.answer, answer_value: fresh.answer_value ?? null, reason: fresh.reason ?? r.reason });
      did.refreshed++;
    }

    const open = app.application_questions.filter(isOpen);
    const results = new Map<string, Partial<Draft> | "draft">();
    const unknown: { row: Draft; q: FormQuestion; id: string }[] = [];
    for (const r of open) {
      const q = asForm(r);
      const row = { ...baseRow(q, r.sort_order), _index: r.sort_order };
      const alias = ctx.aliases.get(normalizeQuestion(q.label));
      const question = alias ? ctx.questionsById.get(alias.question_id) : undefined;
      if (question) {
        results.set(r.id, answerFromQuestion(row, q, question, actx, { inverted: alias!.polarity === "inverted", confirmed: Boolean(alias!.confirmed), skillId: alias!.skill_id ?? null }));
      } else {
        unknown.push({ row, q, id: r.id });
      }
    }
    // Without Claude (after a profile save, or past the monthly cap), only known wordings are answered.
    if (unknown.length > 0 && !(deps.call && budget.spent + ctx.spend.cost < budget.cap)) did.sorted = false;
    if (unknown.length > 0 && deps.call && budget.spent + ctx.spend.cost < budget.cap) {
      const prompt = buildClassifyPrompt({
        catalog: [...ctx.questions.values()].map((t) => ({ key: t.key, label: t.label, answer_type: t.answer_type })),
        facts: ctx.facts,
        posting: { title: app.jobs.title, company_name: app.jobs.company_name, text: app.jobs.description_md ?? "" },
        questions: unknown.map(({ row, q }) => ({ index: row._index, label: q.label, description: q.description, fieldType: q.fieldType, options: q.options.map((o) => o.label), required: q.required })),
      });
      const output = await callWithRetry(deps, deps.call!, "classify", app.job_id, { ...prompt, schema: classifyOutputSchema, maxTokens: 6000 }, ctx.spend);
      if (!output) did.sorted = false;
      const byIndex = new Map((output?.questions ?? []).map((c) => [c.index, c]));
      for (const item of unknown) {
        const c = byIndex.get(item.row._index);
        if (c) results.set(item.id, await applyClassification(db, item, c, actx));
      }
    }

    for (const r of open) {
      const result = results.get(r.id);
      if (!result || result === "draft") continue;
      if (result.bucket === "auto" && result.answer != null) {
        await updateQuestion(db, r.id, {
          answer: result.answer, answer_value: result.answer_value ?? null, bucket: "auto", answer_source: result.answer_source ?? null,
          needs_check: result.needs_check ?? false, reason: result.reason ?? null, question_id: result.question_id ?? r.question_id,
        });
        did.answered++;
      } else if (result.bucket === "needs_user" && r.bucket === "cannot_automate") {
        await updateQuestion(db, r.id, { bucket: "needs_user", reason: result.reason ?? null, question_id: result.question_id ?? r.question_id });
        did.answerable++;
      } else if (result.question_id && result.question_id !== r.question_id) {
        // Linked to its catalog question now, so answering it saves for every form that asks.
        await updateQuestion(db, r.id, { question_id: result.question_id, reason: result.reason ?? r.reason });
      }
    }

    const after = unwrap(await db.from("application_questions").select("required, bucket").eq("application_id", app.id), "read rechecked questions");
    if (app.status === "needs_input" && !after.some((q) => q.required && q.bucket === "needs_user")) {
      await transition(db, app.id, "queued", "worker:recheck");
      did.moved = true;
    }

    counts.answered += did.answered;
    counts.answerable += did.answerable;
    counts.refreshed += did.refreshed;
    if (did.moved) counts.movedToReview++;
    // Brought up to the current rules once its open questions were sorted with them, with a note of what changed.
    if (deps.call && did.sorted) {
      const note = recheckNote(did);
      check(await db.from("applications").update({ ...current, ...(note ? { recheck_note: note } : {}) }).eq("id", app.id), "mark application rechecked");
    }
  };

  // A few at a time: each is at most one Claude call.
  const queue = [...apps];
  const workers = Array.from({ length: Math.max(1, opts.concurrency ?? 6) }, async () => {
    for (let app = queue.shift(); app; app = queue.shift()) {
      try {
        await recheck(app);
      } catch (err) {
        log(`${app.id}: recheck failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  });
  await Promise.all(workers);
  counts.cost_usd = Math.round(ctx.spend.cost * 1e6) / 1e6;
  return counts;
}

/** user_settings key: when you last changed your profile, skills or jobs (a resume older than this is out of date). */
export const PROFILE_CHANGED_KEY = "profile_changed_at";

/**
 * Tailors an application's resume again from your profile as it is now (after you changed it), with the
 * same fact check as prepare, and replaces the PDF the runner attaches.
 *
 * @throws {@link ValidationError} when the application is gone or this month's Claude budget is used up.
 */
export async function rebuildResume(deps: { db: Db; userId: string; call: StructuredCall; now?: Date }, applicationId: string): Promise<"tailored" | "fallback"> {
  const { db, userId, now = new Date() } = deps;
  const app = await getApplication(db, userId, applicationId);
  if (!app) throw new ValidationError("That application is gone; reload the page.");
  const budget = await getMonthlySpend(db, userId, now);
  if (budget.spent >= budget.cap) throw new ValidationError("This month's Claude budget is used up.");
  const [profile, lessons, job] = await Promise.all([getProfile(db, userId), lessonsFor(db, userId, "tailoring"), getJobPosting(db, app.job.id)]);
  const resume = await tailorResume({
    db, userId, call: deps.call, data: profile,
    lessons: lessons.map((l) => ({ rule: l.rule, scope: l.scope, active: l.active })),
    posting: { title: app.job.title, company_name: app.job.company_name, text: job?.description_md ?? "" },
    jobId: app.job.id, now, spend: { cost: 0 },
  });
  await saveApplicationResume(db, userId, app.id, resume, `${app.job.title} at ${app.job.company_name}`);
  return resume.kind;
}
