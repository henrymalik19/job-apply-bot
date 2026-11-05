// LLM spend tracking: every call is recorded with its token counts and cost,
// and workers stop calling the API for the month once the cap is reached.
import { z } from "zod";
import type { Db } from "@/server/db/types";
import { costUsd, type TokenUsage } from "@/server/integrations/anthropic/pricing";
import * as settings from "@/server/modules/settings/settings.service";
import { insertUsage, spendRowsSince, spendSince } from "./usage.repository";

/** Settings key for the monthly LLM spend cap in dollars. */
export const SPEND_CAP_KEY = "llm_monthly_cap_usd";
const DEFAULT_CAP_USD = 5;

/** First instant of the current calendar month (UTC). */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** A user's spend this month and their cap, in dollars. */
export async function getMonthlySpend(db: Db, userId: string, now: Date): Promise<{ spent: number; cap: number }> {
  const [spent, cap] = await Promise.all([
    spendSince(db, userId, monthStart(now)),
    settings.getUserSetting(db, userId, SPEND_CAP_KEY).then((v) => z.number().positive().catch(DEFAULT_CAP_USD).parse(v)),
  ]);
  return { spent, cap };
}

/**
 * Records one LLM call made for a user and returns its cost in dollars.
 *
 * @param purpose - What the call was for, e.g. "score" or "suggest_titles".
 */
export async function recordUsage(
  db: Db,
  userId: string,
  call: { purpose: string; model: string; usage: TokenUsage; jobId?: string | null },
): Promise<number> {
  const cost = costUsd(call.model, call.usage);
  await insertUsage(db, {
    user_id: userId,
    purpose: call.purpose,
    model: call.model,
    input_tokens: call.usage.input_tokens,
    output_tokens: call.usage.output_tokens,
    cache_read_tokens: call.usage.cache_read_input_tokens ?? 0,
    cache_write_tokens: call.usage.cache_creation_input_tokens ?? 0,
    cost_usd: cost,
    job_id: call.jobId ?? null,
  });
  return cost;
}

/** What each kind of Claude call is for, in a few words. */
export const PURPOSE_LABELS: Record<string, string> = {
  score: "Scoring jobs",
  classify: "Sorting application questions",
  draft: "Drafting answers",
  redraft: "Redrafting answers",
  pick_option: "Picking dropdown options",
  tailor: "Tailoring resumes",
  map_fields: "Filling fields the runner found",
  track_email: "Reading job emails",
  suggest_titles: "Suggesting job titles",
  skill_cleanup: "Cleaning up skills",
};

/** Calls that go into preparing and filling one application (the job is the application). */
const APPLICATION_PURPOSES = new Set(["classify", "draft", "redraft", "pick_option", "tailor", "map_fields"]);

/** Where a month's Claude spend went: by kind of call, per application prepared and per job scored. */
export type SpendSummary = {
  total: number;
  byPurpose: { purpose: string; label: string; calls: number; cost: number }[];
  /** Applications with any preparing or filling call this month. */
  applications: number;
  /** What preparing and filling one application cost, on average. */
  perApplication: number | null;
  scored: number;
  perScore: number | null;
  /** Everything this month (scoring, email, the rest) divided over the applications. */
  allInPerApplication: number | null;
};

/** Sums a month's calls (most expensive kind first). */
export function summarizeSpend(rows: { purpose: string; job_id: string | null; cost_usd: number }[]): SpendSummary {
  const by = new Map<string, { calls: number; cost: number }>();
  const apps = new Set<string>();
  const scored = new Set<string>();
  let total = 0;
  let appCost = 0;
  for (const r of rows) {
    total += r.cost_usd;
    const p = by.get(r.purpose) ?? { calls: 0, cost: 0 };
    p.calls += 1;
    p.cost += r.cost_usd;
    by.set(r.purpose, p);
    if (APPLICATION_PURPOSES.has(r.purpose)) {
      appCost += r.cost_usd;
      if (r.job_id) apps.add(r.job_id);
    }
    if (r.purpose === "score" && r.job_id) scored.add(r.job_id);
  }
  const scoreCost = by.get("score")?.cost ?? 0;
  return {
    total,
    byPurpose: [...by.entries()]
      .map(([purpose, v]) => ({ purpose, label: PURPOSE_LABELS[purpose] ?? purpose, ...v }))
      .sort((a, b) => b.cost - a.cost),
    applications: apps.size,
    perApplication: apps.size ? appCost / apps.size : null,
    scored: scored.size,
    perScore: scored.size ? scoreCost / scored.size : null,
    allInPerApplication: apps.size ? total / apps.size : null,
  };
}

/** This month's spend broken down, with the cap and about how many more applications it leaves room for. */
export async function getSpendSummary(db: Db, userId: string, now: Date): Promise<SpendSummary & { cap: number; applicationsLeft: number | null }> {
  const [rows, { cap }] = await Promise.all([spendRowsSince(db, userId, monthStart(now)), getMonthlySpend(db, userId, now)]);
  const summary = summarizeSpend(rows);
  const left = Math.max(0, cap - summary.total);
  return { ...summary, cap, applicationsLeft: summary.allInPerApplication ? Math.floor(left / summary.allInPerApplication) : null };
}
