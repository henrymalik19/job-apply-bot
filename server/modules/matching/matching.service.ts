// Matching, per user: for each open job from a followed board without a match
// for that user, apply the user's search filters (discovery keeps a job when
// any user's filters pass) and the hard filters in code, then score the rest
// with Claude. Every outcome (filtered, scored, failed) is stored, one row per
// user and job, so re-runs never duplicate.
import type { Db, Json } from "@/server/db/types";
import type { StructuredCall } from "@/server/integrations/anthropic/claude";
import { locationsFromSaved } from "@/server/integrations/ats/boards";
import {
  getJobFilter,
  getMatchCriteria,
  getTitleFilter,
  jobFilterReason,
  passesTitleFilter,
  type MatchCriteria,
} from "@/server/modules/criteria/criteria.service";
import {
  jobsForFiltering,
  listJobs,
  listOpenJobsForMatching,
  type JobFilters,
  type JobListItem,
  type MatchableJobRow,
} from "@/server/modules/jobs/jobs.service";
import { lessonsFor } from "@/server/modules/lessons/lessons.service";
import { getProfileLines } from "@/server/modules/profile/profile.service";
import { failInterruptedRuns, finishRun, latestWorkerRun, startRun } from "@/server/modules/runs/runs.service";
import { getMonthlySpend, recordUsage } from "@/server/modules/usage/usage.service";
import { hardFilter } from "./hard-filters";
import { DEFAULT_PAGE_SIZE, pageOf, type Page } from "@/shared/paginate";
import { insertMatch, listMatchedJobIds, matchCounts, matchesForJobs, searchMatchedJobs } from "./matches.repository";
import {
  buildScoringPrompt,
  scoreOutputSchema,
  scoreResultSchema,
  type PromptFact,
  type PromptLesson,
  type ScoreResult,
} from "./scoring-prompt";

const WORKER = "match";
const INTERRUPTED_AFTER_MS = 60 * 60 * 1000;

/** Dependencies of a matching run; tests inject a fake `call`. */
export type MatchDeps = {
  /** Service-role client. */
  db: Db;
  /** Whose jobs to match. */
  userId: string;
  /** Structured LLM call (Claude in production). */
  call: StructuredCall;
  now?: () => Date;
  /** Most jobs to score in one run (hard-filtered jobs don't count). Default 400. */
  maxScored?: number;
  /** Jobs scored at the same time. Default 4. */
  concurrency?: number;
  /** Only consider these jobs (tests). */
  onlyJobIds?: string[];
  log?: (line: string) => void;
};

/** What a matching run did. */
export type MatchCounts = {
  candidates: number;
  filtered: number;
  scored: number;
  failed: number;
  /** Left for the next run: over `maxScored` or over the monthly spend cap. */
  deferred: number;
  cost_usd: number;
};

/** Outcome of scoring one job. */
type ScoreOutcome = { result: ScoreResult; model: string } | { error: string; model: string };

/** Scores one job, retrying once when the output is missing or invalid. Records usage for every call. */
async function scoreJob(
  deps: MatchDeps,
  job: MatchableJobRow,
  context: { facts: PromptFact[]; criteria: MatchCriteria; lessons: PromptLesson[] },
  spend: { cost: number },
): Promise<ScoreOutcome> {
  const prompt = buildScoringPrompt({ ...context, job });
  let lastError = "no attempt";
  let model = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await deps.call({ system: prompt.system, user: prompt.user, schema: scoreOutputSchema, maxTokens: 4000, effort: "low" });
    model = res.model;
    spend.cost += await recordUsage(deps.db, deps.userId, { purpose: "score", model: res.model, usage: res.usage, jobId: job.id });
    const valid = res.output == null ? null : scoreResultSchema.safeParse({ ...res.output, score: Math.round(Number(res.output.score)) });
    if (valid?.success) return { result: valid.data, model };
    lastError = res.error ?? `invalid output: ${valid?.error.issues[0]?.message ?? "unknown"}`;
  }
  return { error: lastError, model };
}

/**
 * Runs matching once. Hard-filtered jobs are recorded without an LLM call;
 * scoring stops for the run at `maxScored` jobs or when the monthly spend cap
 * is reached (remaining jobs are scored on a later run).
 *
 * @throws Only when the run itself cannot proceed (e.g. the database is unreachable).
 */
export async function runMatch(deps: MatchDeps): Promise<{ runId: string; counts: MatchCounts }> {
  const { db, userId, now = () => new Date(), maxScored = 400, concurrency = 4, log = () => {} } = deps;
  await failInterruptedRuns(db, WORKER, new Date(now().getTime() - INTERRUPTED_AFTER_MS));
  const runId = await startRun(db, WORKER, null, userId);
  const counts: MatchCounts = { candidates: 0, filtered: 0, scored: 0, failed: 0, deferred: 0, cost_usd: 0 };

  try {
    const [criteria, jobs, facts, lessons, budget, titleFilter, jobFilter] = await Promise.all([
      getMatchCriteria(db, userId),
      listOpenJobsForMatching(db, userId),
      getProfileLines(db, userId),
      lessonsFor(db, userId, "scoring"),
      getMonthlySpend(db, userId, now()),
      getTitleFilter(db, userId),
      getJobFilter(db, userId),
    ]);
    const done = await listMatchedJobIds(db, userId);
    const only = deps.onlyJobIds ? new Set(deps.onlyJobIds) : null;
    const todo = jobs.filter((j) => !done.has(j.id) && (!only || only.has(j.id)));
    counts.candidates = todo.length;

    const context = {
      facts: facts.map((f) => ({ category: f.category, fact: f.fact })),
      criteria,
      lessons: lessons.map((l) => ({ rule: l.rule, scope: l.scope, active: l.active })),
    };
    const base = { user_id: userId, job_id: "" };

    // The user's own search filters (the posting's age was checked when it was found).
    const saved = new Map((await jobsForFiltering(db, todo.map((j) => j.id))).map((j) => [j.id, j]));
    const searchReason = (job: MatchableJobRow): string | null => {
      if (!passesTitleFilter(job.title, titleFilter)) return "search filter: title";
      const locations = locationsFromSaved(job.location, saved.get(job.id)?.raw ?? null);
      const reason = jobFilterReason({ remote_type: job.remote_type ?? "unknown", locations, posted_at: null }, jobFilter, now());
      return reason ? `search filter: ${reason}` : null;
    };

    // Search and hard filters first: no LLM call, no budget.
    const toScore: MatchableJobRow[] = [];
    for (const job of todo) {
      const reason = searchReason(job) ?? hardFilter(job, criteria);
      if (!reason) {
        toScore.push(job);
        continue;
      }
      await insertMatch(db, { ...base, job_id: job.id, hard_filter_passed: false, hard_filter_reason: reason, score: null, reasons: null, model: null, status: "filtered", error: null });
      counts.filtered++;
    }

    const spend = { cost: 0 };
    let next = 0;
    const worker = async () => {
      while (next < toScore.length) {
        if (counts.scored + counts.failed >= maxScored || budget.spent + spend.cost >= budget.cap) return;
        const job = toScore[next++];
        const outcome = await scoreJob(deps, job, context, spend);
        if ("result" in outcome) {
          const { score, fits, gaps, summary } = outcome.result;
          await insertMatch(db, { ...base, job_id: job.id, hard_filter_passed: true, hard_filter_reason: null, score, reasons: { fits, gaps, summary } as Json, model: outcome.model, status: "scored", error: null });
          counts.scored++;
        } else {
          await insertMatch(db, { ...base, job_id: job.id, hard_filter_passed: true, hard_filter_reason: null, score: null, reasons: null, model: outcome.model || null, status: "failed", error: outcome.error.slice(0, 500) });
          counts.failed++;
          log(`failed ${job.id}: ${outcome.error}`);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
    counts.deferred = toScore.length - counts.scored - counts.failed;
    counts.cost_usd = Math.round(spend.cost * 1e6) / 1e6;
    if (budget.spent + spend.cost >= budget.cap) log(`monthly LLM cap $${budget.cap} reached; ${counts.deferred} job(s) deferred`);

    await finishRun(db, runId, { ok: true, counts });
    return { runId, counts };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishRun(db, runId, { ok: false, counts, error: message }).catch(() => {});
    throw err;
  }
}

/** A Jobs-page row with its current match (score null until scored; reason set when ruled out). */
export type BrowsedJob = JobListItem & { score: number | null; matchStatus: string | null; filterReason: string | null };

/** Match statuses each Jobs-page match option shows. "all" also includes jobs not matched yet. */
const STATUSES_FOR: Record<Exclude<JobFilters["match"], "all">, string[]> = {
  relevant: ["scored", "failed"],
  matched: ["scored"],
  ruled_out: ["filtered"],
};

/**
 * One page of the Jobs list with current-criteria scores. Every view except
 * "all" reads from matches (filtered and sorted in the database), so ruled-out
 * jobs are hidden by default; "all" reads jobs and attaches each one's match.
 */
export async function browseJobs(
  db: Db,
  userId: string,
  filters: JobFilters,
  page: number,
  now: Date,
): Promise<{ page: Page<BrowsedJob>; threshold: number }> {
  const criteria = await getMatchCriteria(db, userId);
  if (filters.match !== "all") {
    const options = {
      statuses: STATUSES_FOR[filters.match],
      minScore: filters.match === "matched" ? criteria.threshold : null,
    };
    const { rows, total } = await searchMatchedJobs(db, userId, options, filters, page, DEFAULT_PAGE_SIZE, now);
    return { page: pageOf(rows, total, page), threshold: criteria.threshold };
  }
  if (filters.sort === "score") {
    const options = { statuses: ["scored", "failed", "filtered"], minScore: null };
    const { rows, total } = await searchMatchedJobs(db, userId, options, filters, page, DEFAULT_PAGE_SIZE, now);
    return { page: pageOf(rows, total, page), threshold: criteria.threshold };
  }
  const list = await listJobs(db, filters, page, now);
  const matches = await matchesForJobs(db, userId, list.items.map((j) => j.id));
  const items = list.items.map((j) => {
    const m = matches.get(j.id);
    return { ...j, score: m?.score ?? null, matchStatus: m?.status ?? null, filterReason: m?.hard_filter_reason ?? null };
  });
  return { page: { ...list, items }, threshold: criteria.threshold };
}

/** A user's match for a job, with its parsed reasons, or null when not matched yet. */
export async function getJobMatch(db: Db, userId: string, jobId: string) {
  const criteria = await getMatchCriteria(db, userId);
  const m = (await matchesForJobs(db, userId, [jobId])).get(jobId);
  if (!m) return null;
  const reasons = (m.reasons ?? {}) as { fits?: string[]; gaps?: string[]; summary?: string };
  return {
    status: m.status,
    score: m.score,
    threshold: criteria.threshold,
    filterReason: m.hard_filter_reason,
    error: m.error,
    fits: reasons.fits ?? [],
    gaps: reasons.gaps ?? [],
    summary: reasons.summary ?? "",
  };
}

/** A user's match counts, for the overview and Health. */
export async function getMatchSummary(db: Db, userId: string) {
  const criteria = await getMatchCriteria(db, userId);
  return { threshold: criteria.threshold, ...(await matchCounts(db, userId, criteria.threshold)) };
}

/** What Health shows about a user's matching: the last run, outcome counts, and this month's LLM spend. */
export async function loadMatchingHealth(db: Db, userId: string, now: Date) {
  const [lastRun, summary, spend] = await Promise.all([
    latestWorkerRun(db, WORKER),
    getMatchSummary(db, userId),
    getMonthlySpend(db, userId, now),
  ]);
  return { lastRun, summary, spend, capReached: spend.spent >= spend.cap };
}
