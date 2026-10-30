// Prepare: for the best-scoring open jobs without an application, fetch the
// application form, check it for AI rules, answer each question from where
// its answer lives (profile, criteria, skill years, saved answers), have
// Claude match wordings it hasn't seen to the question catalog and draft
// open-ended answers, then store the application in the right lane: queued
// (ready to approve), needs_input (Needs you) or manual.
import type { Db, Json } from "@/server/db/types";
import type { StructuredCall } from "@/server/integrations/anthropic/claude";
import { fetchApplicationForm, type ApplicationForm, type FormQuestion } from "@/server/integrations/ats/forms";
import type { AppStatus } from "@/server/modules/applications/applications.service";
import { getMatchCriteria, type MatchCriteria } from "@/server/modules/criteria/criteria.service";
import { lessonsFor } from "@/server/modules/lessons/lessons.service";
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
import { getSetting } from "@/server/modules/settings/settings.service";
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
  classifyOutputSchema,
  draftOutputSchema,
  type ClassifiedQuestion,
  type PromptPosting,
  type PromptQuestion,
} from "./prepare-prompts";
import {
  asJson,
  countApplicationsSince,
  insertApplication,
  setPrepareError,
  listPrepareCandidates,
  type NewQuestion,
  type PrepareCandidate,
} from "./prepare.repository";

const WORKER = "prepare";
const INTERRUPTED_AFTER_MS = 60 * 60 * 1000;
/** A classifier pick below this confidence isn't saved as an alias and goes to the owner. */
export const ALIAS_CONFIDENCE = 0.8;

/** Dependencies of a prepare run; tests inject fakes. */
export type PrepareDeps = {
  /** Service-role client. */
  db: Db;
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
};

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
};

const isResume = (q: FormQuestion) => q.fieldType === "file" && /resume|cv/i.test(`${q.fieldName} ${q.label}`);
const isCoverLetter = (q: FormQuestion) => /cover[ _]?letter/i.test(`${q.fieldName} ${q.label}`);

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
      return profileValue(question.key, ctx.profile, { country: ctx.country, now: ctx.now });
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

/** Fills a row from a catalog question: auto when its value fits the form, otherwise Needs you. */
function answerFromQuestion(row: Draft, q: FormQuestion, question: Question, ctx: RunContext, mapping: Mapping): Partial<Draft> | "draft" {
  const linked = { question_id: question.id };
  if (question.answer_source === "drafted") return "draft";
  if (question.answer_source === "ask") return { ...linked, bucket: "needs_user", reason: `"${question.label}" is always answered by you` };
  const value = questionValue(question, mapping, ctx);
  if (value == null) return { ...linked, bucket: "needs_user", reason: `${WHERE[question.answer_source]} "${question.label}"` };
  const shaped = shapeAnswer(q, value, mapping.inverted);
  if (!shaped) return { ...linked, bucket: "needs_user", reason: `your answer for "${question.label}" doesn't fit this question's options` };
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
  deps: PrepareDeps,
  call: StructuredCall,
  purpose: string,
  jobId: string,
  request: Parameters<StructuredCall>[0] & { schema: import("zod").ZodType<T> },
  spend: { cost: number },
): Promise<T | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await call<T>(request);
    spend.cost += await recordUsage(deps.db, { purpose, model: res.model, usage: res.usage, jobId });
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
  const ctx: RunContext = { ...runCtx, country: countries.size === 1 ? [...countries][0] : "US" };
  const fetchForm = deps.fetchForm ?? ((ats, token, id) => fetchApplicationForm(ats, token, id));
  const form = await fetchForm(job.source, job.board_token, job.external_id);
  if (!form) {
    // Still tailor a resume: a manual application needs one too.
    const posting = { title: job.title, company_name: job.company_name, text: job.description_md ?? "" };
    return { status: "manual", flags: [], questions: [], posting, error: `no application form available from ${job.source}` };
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
    const restriction = findAiRestriction(`${q.label}\n${q.description ?? ""}`);
    if (restriction) flags.push({ kind: "ai_restriction", excerpt: restriction, where: q.fieldName });

    if (isResume(q)) {
      Object.assign(row, { bucket: "auto", answer: "Tailored resume (PDF)", answer_source: "profile" });
    } else if (q.fieldType === "file") {
      Object.assign(row, isCoverLetter(q) && !q.required
        ? { bucket: "auto", reason: "optional; not sent" }
        : { bucket: "needs_user", reason: "file upload" });
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
      questions: toDraft.map(({ row, q }) => ({
        index: row._index, label: q.label, description: q.description, fieldType: q.fieldType, options: [], required: q.required,
      })),
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

  const questions = rows.map(({ _index: _i, ...r }) => r);
  const blocking = questions.filter((q) => q.required);
  const status: AppStatus = blocking.some((q) => q.bucket === "cannot_automate")
    ? "manual"
    : blocking.some((q) => q.bucket === "needs_user")
      ? "needs_input"
      : "queued";
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
      return { bucket: "cannot_automate", reason: c.reason };
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

function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Runs prepare once: up to the daily cap (`settings.daily_cap`, default 20)
 * of the best-scoring open jobs without an application, stopping early at the
 * monthly LLM cap. Each job's failure is recorded on its application and
 * doesn't stop the run.
 */
export async function runPrepare(deps: PrepareDeps): Promise<{ runId: string; counts: PrepareCounts }> {
  const { db, now = () => new Date(), log = () => {} } = deps;
  await failInterruptedRuns(db, WORKER, new Date(now().getTime() - INTERRUPTED_AFTER_MS));
  const runId = await startRun(db, WORKER, null);
  const counts: PrepareCounts = { candidates: 0, queued: 0, needs_input: 0, manual: 0, failed: 0, deferred: 0, tailored: 0, untailored: 0, cost_usd: 0 };

  try {
    const [criteria, profile, answerLessons, tailoringLessons, questions, aliases, answers, budget, cap, today] = await Promise.all([
      getMatchCriteria(db),
      getProfile(db),
      lessonsFor(db, "answers"),
      lessonsFor(db, "tailoring"),
      listQuestions(db),
      listAliases(db),
      listAnswers(db),
      getMonthlySpend(db, now()),
      getSetting(db, "daily_cap"),
      countApplicationsSince(db, utcDayStart(now())),
    ]);
    const room = Math.min(deps.limit ?? Infinity, Math.max(0, Number(cap ?? 20) - today));
    let candidates = await listPrepareCandidates(db, criteria.threshold, deps.onlyJobIds ? 500 : room + 50);
    if (deps.onlyJobIds) {
      const only = new Set(deps.onlyJobIds);
      candidates = candidates.filter((c) => only.has(c.job.id));
    }
    counts.candidates = candidates.length;

    const ctx: RunContext = {
      questions: new Map(questions.map((q) => [q.key, q])),
      questionsById: new Map(questions.map((q) => [q.id, q])),
      aliases,
      answers,
      profile,
      criteria,
      facts: profileLines(profile, now()),
      country: "US",
      now: now(),
      answerLessons: answerLessons.map((l) => ({ rule: l.rule, scope: l.scope, active: l.active })),
      tailoringLessons: tailoringLessons.map((l) => ({ rule: l.rule, scope: l.scope, active: l.active })),
      spend: { cost: 0 },
    };

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
          job_id: candidate.job.id,
          match_id: candidate.matchId,
          status: result.status,
          flags: result.flags as NonNullable<Json>,
          apply_method: "self",
          prepared_at: now().toISOString(),
          prepare_error: result.error?.slice(0, 500) ?? null,
        },
        result.questions,
      );
      made++;
      if (result.posting) {
        try {
          const resume = await tailorResume({
            db, call: deps.draftCall, data: profile, lessons: ctx.tailoringLessons, posting: result.posting,
            jobId: candidate.job.id, now: now(), spend: ctx.spend,
          });
          await saveApplicationResume(db, applicationId, resume, `${candidate.job.title} at ${candidate.job.company_name}`);
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
    counts.cost_usd = Math.round(ctx.spend.cost * 1e6) / 1e6;
    await finishRun(db, runId, { ok: true, counts });
    return { runId, counts };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishRun(db, runId, { ok: false, counts, error: message }).catch(() => {});
    throw err;
  }
}
