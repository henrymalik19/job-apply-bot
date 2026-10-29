// Prepare: for the best-scoring open jobs without an application, fetch the
// application form, check it for AI rules, answer what the answer bank and
// confirmed facts support, have Claude sort the questions it doesn't know and
// draft open-ended answers, then store the application in the right lane:
// queued (ready to approve), needs_input (Needs you) or manual.
import type { Db, Json } from "@/server/db/types";
import type { StructuredCall } from "@/server/integrations/anthropic/claude";
import { fetchApplicationForm, type ApplicationForm, type FormQuestion } from "@/server/integrations/ats/forms";
import type { AppStatus } from "@/server/modules/applications/applications.service";
import { getMatchCriteria } from "@/server/modules/criteria/criteria.service";
import { lessonsFor } from "@/server/modules/lessons/lessons.service";
import { resolvePlace } from "@/server/modules/criteria/places";
import { getProfile, profileLines, type ProfileData } from "@/server/modules/profile/profile.service";
import { failInterruptedRuns, finishRun, startRun } from "@/server/modules/runs/runs.service";
import { getSetting } from "@/server/modules/settings/settings.service";
import { getMonthlySpend, recordUsage } from "@/server/modules/usage/usage.service";
import { findAiRestriction, postingFlags, visibleText, type ApplicationFlag } from "./ai-rules";
import { declineOption, isProfileTopic, normalizeQuestion, profileValue, shapeAnswer, type TopicValue } from "./answers";
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
  ensureTopic,
  insertApplication,
  insertVariant,
  listPrepareCandidates,
  listTopics,
  listVariants,
  type NewQuestion,
  type PrepareCandidate,
  type Topic,
  type Variant,
} from "./prepare.repository";

const WORKER = "prepare";
const INTERRUPTED_AFTER_MS = 60 * 60 * 1000;
/** A classifier pick below this confidence isn't saved as a variant and goes to the owner. */
export const VARIANT_CONFIDENCE = 0.8;

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
  cost_usd: number;
};

// Standard fields recognized by their form field name.
const IDENTITY_FIELDS: Record<string, { key: string; label: string; value_type: "text" }> = {
  first_name: { key: "first_name", label: "First name", value_type: "text" },
  last_name: { key: "last_name", label: "Last name", value_type: "text" },
  email: { key: "email", label: "Email", value_type: "text" },
  phone: { key: "phone", label: "Phone", value_type: "text" },
  _systemfield_name: { key: "full_name", label: "Full name", value_type: "text" },
  _systemfield_email: { key: "email", label: "Email", value_type: "text" },
  _systemfield_location: { key: "current_location", label: "Where I live (city, state)", value_type: "text" },
};

const isResume = (q: FormQuestion) => q.fieldType === "file" && /resume|cv/i.test(`${q.fieldName} ${q.label}`);
const isCoverLetter = (q: FormQuestion) => /cover[ _]?letter/i.test(`${q.fieldName} ${q.label}`);

/** Context shared by every application in a run. */
type RunContext = {
  topics: Map<string, Topic>;
  topicsById: Map<string, Topic>;
  variants: Map<string, Variant>;
  profile: ProfileData;
  /** The profile as prompt lines. */
  facts: { category: string; fact: string }[];
  /** The posting's country (ISO code), set per job. */
  country: string;
  now: Date;
  answerLessons: { rule: string; scope: string; active: boolean }[];
  spend: { cost: number };
};

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
    answer_topic_id: null,
    needs_check: false,
    reason: null,
  };
}

function topicValue(topic: Topic, ctx: RunContext): TopicValue | null {
  if (isProfileTopic(topic.key)) return profileValue(topic.key, ctx.profile, { country: ctx.country, now: ctx.now });
  return (topic.value as TopicValue | null) ?? null;
}

/** Fills a row from a topic: auto when the value fits the form, otherwise Needs you. */
function answerFromTopic(row: Draft, q: FormQuestion, topic: Topic, ctx: RunContext, variant: { inverted: boolean; confirmed: boolean }): Draft {
  const value = topicValue(topic, ctx);
  const linked = { ...row, answer_topic_id: topic.id };
  if (value == null) {
    const why = isProfileTopic(topic.key) ? `your profile doesn't say "${topic.label}"` : `no saved answer for "${topic.label}"`;
    return { ...linked, bucket: "needs_user", reason: why };
  }
  const shaped = shapeAnswer(q, value, variant.inverted);
  if (!shaped) return { ...linked, bucket: "needs_user", reason: `your answer for "${topic.label}" doesn't fit this question's options` };
  return {
    ...linked,
    bucket: "auto",
    answer: shaped.answer,
    answer_value: asJson(shaped.value),
    answer_source: isProfileTopic(topic.key) ? "fact" : "bank",
    needs_check: !variant.confirmed,
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
): Promise<{ status: AppStatus; flags: ApplicationFlag[]; questions: NewQuestion[]; error?: string }> {
  const { job } = candidate;
  // Work-authorization questions are about the posting's country; US unless its location names exactly one other.
  const countries = resolvePlace(job.location ?? "").countries;
  const ctx: RunContext = { ...runCtx, country: countries.size === 1 ? [...countries][0] : "US" };
  const fetchForm = deps.fetchForm ?? ((ats, token, id) => fetchApplicationForm(ats, token, id));
  const form = await fetchForm(job.source, job.board_token, job.external_id);
  if (!form) return { status: "manual", flags: [], questions: [], error: `no application form available from ${job.source}` };

  const flags = postingFlags(form.descriptionHtml);
  const postingRestricted = flags.some((f) => f.kind === "ai_restriction");
  const posting: PromptPosting = {
    title: job.title,
    company_name: job.company_name,
    text: visibleText(form.descriptionHtml) || job.description_md || "",
  };

  const rows: Draft[] = [];
  const unknown: { row: Draft; q: FormQuestion }[] = [];
  for (const [index, q] of form.questions.entries()) {
    if (q.fieldType === "hidden") continue;
    const row = baseRow(q, index);
    const restriction = findAiRestriction(`${q.label}\n${q.description ?? ""}`);
    if (restriction) flags.push({ kind: "ai_restriction", excerpt: restriction, where: q.fieldName });

    if (isResume(q)) {
      rows.push({ ...row, bucket: "auto", answer: "Tailored resume (PDF)", answer_source: "fact" });
    } else if (q.fieldType === "file") {
      rows.push(isCoverLetter(q) && !q.required
        ? { ...row, bucket: "auto", answer: null, reason: "optional; not sent" }
        : { ...row, bucket: "needs_user", reason: "file upload" });
    } else if (q.group === "eeo") {
      const decline = declineOption(q);
      rows.push(decline
        ? { ...row, bucket: "auto", answer: decline.answer, answer_value: asJson(decline.value), answer_source: "bank" }
        : { ...row, bucket: q.required ? "needs_user" : "auto", reason: q.required ? "voluntary question without a decline option" : "optional; left blank" });
    } else {
      const identity = IDENTITY_FIELDS[q.fieldName];
      const variant = ctx.variants.get(normalizeQuestion(q.label));
      const topic = identity ? ctx.topics.get(identity.key) : variant ? ctx.topicsById.get(variant.answer_topic_id) : undefined;
      if (topic) {
        rows.push(answerFromTopic(row, q, topic, ctx, {
          inverted: !identity && variant?.polarity === "inverted",
          confirmed: Boolean(identity) || Boolean(variant?.confirmed),
        }));
      } else if (identity) {
        // A standard field whose topic doesn't exist yet: create it so Needs you can save the answer.
        const created = await ensureTopicCached(deps.db, ctx, { ...identity, category: "other", source: "fact" });
        rows.push(answerFromTopic(row, q, created, ctx, { inverted: false, confirmed: true }));
      } else {
        rows.push(row);
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
      topics: [...ctx.topics.values()].map((t) => ({ key: t.key, label: t.label, value_type: t.value_type })),
      facts: ctx.facts,
      posting,
      questions: promptQuestions,
    });
    const output = await callWithRetry(deps, deps.call, "classify", job.id, { ...prompt, schema: classifyOutputSchema, maxTokens: 6000 }, ctx.spend);
    if (!output) return { status: "failed", flags, questions: [], error: "question classification failed twice" };
    const byIndex = new Map(output.questions.map((c) => [c.index, c]));

    const toDraft: { row: Draft; q: FormQuestion }[] = [];
    for (const item of unknown) {
      const c = byIndex.get(item.row._index);
      const filled = c ? await applyClassification(deps.db, item, c, ctx) : { ...item.row, bucket: "needs_user" as const, reason: "not classified" };
      if (filled === "draft") {
        const restricted = postingRestricted || flags.some((f) => f.kind === "ai_restriction" && f.where === item.q.fieldName);
        if (restricted) Object.assign(item.row, { bucket: "needs_user", reason: "the employer restricts AI-written answers" });
        else toDraft.push(item);
      } else {
        Object.assign(item.row, filled);
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
  }

  const questions = rows.map(({ _index: _i, ...r }) => r);
  const blocking = questions.filter((q) => q.required);
  const status: AppStatus = blocking.some((q) => q.bucket === "cannot_automate")
    ? "manual"
    : blocking.some((q) => q.bucket === "needs_user")
      ? "needs_input"
      : "queued";
  return { status, flags, questions };
}

async function ensureTopicCached(
  db: Db,
  ctx: RunContext,
  topic: { key: string; label: string; category: string; value_type: string; source?: string },
): Promise<Topic> {
  const existing = ctx.topics.get(topic.key);
  if (existing) return existing;
  const created = await ensureTopic(db, topic as Parameters<typeof ensureTopic>[1]);
  ctx.topics.set(created.key, created);
  ctx.topicsById.set(created.id, created);
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
        ? { bucket: "auto", answer: shaped.answer, answer_value: asJson(shaped.value), answer_source: "fact", needs_check: true, reason: c.reason }
        : { bucket: "needs_user", reason: c.qualification_answer === "no" ? `facts suggest no: ${c.reason}` : `facts don't settle it: ${c.reason}` };
    }
    case "topic": {
      const known = c.topic_key ? ctx.topics.get(c.topic_key) : undefined;
      const topic = known ?? (c.new_topic ? await ensureTopicCached(db, ctx, c.new_topic) : undefined);
      if (!topic) return { bucket: "needs_user", reason: c.reason };
      if (c.confidence >= VARIANT_CONFIDENCE) {
        const variant = { normalized_text: normalizeQuestion(q.label), answer_topic_id: topic.id, polarity: c.polarity, confidence: c.confidence, confirmed: false };
        await insertVariant(db, variant);
        ctx.variants.set(variant.normalized_text, { ...variant, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
        return answerFromTopic(row, q, topic, ctx, { inverted: c.polarity === "inverted", confirmed: false });
      }
      return { ...row, answer_topic_id: topic.id, bucket: "needs_user", reason: `not sure this is "${topic.label}"` };
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
  const counts: PrepareCounts = { candidates: 0, queued: 0, needs_input: 0, manual: 0, failed: 0, deferred: 0, cost_usd: 0 };

  try {
    const [{ versionId, criteria }, profile, answerLessons, topics, variants, budget, cap, today] = await Promise.all([
      getMatchCriteria(db),
      getProfile(db),
      lessonsFor(db, "answers"),
      listTopics(db),
      listVariants(db),
      getMonthlySpend(db, now()),
      getSetting(db, "daily_cap"),
      countApplicationsSince(db, utcDayStart(now())),
    ]);
    const room = Math.max(0, Number(cap ?? 20) - today);
    let candidates = await listPrepareCandidates(db, versionId, criteria.threshold, deps.onlyJobIds ? 500 : room + 50);
    if (deps.onlyJobIds) {
      const only = new Set(deps.onlyJobIds);
      candidates = candidates.filter((c) => only.has(c.job.id));
    }
    counts.candidates = candidates.length;

    const ctx: RunContext = {
      topics: new Map(topics.map((t) => [t.key, t])),
      topicsById: new Map(topics.map((t) => [t.id, t])),
      variants,
      profile,
      facts: profileLines(profile, now()),
      country: "US",
      now: now(),
      answerLessons: answerLessons.map((l) => ({ rule: l.rule, scope: l.scope, active: l.active })),
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
      await insertApplication(
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
